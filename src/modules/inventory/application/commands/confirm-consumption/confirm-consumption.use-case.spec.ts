import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { ConsumeStockBatchCommand } from '../consume-stock-batch/consume-stock-batch.command';
import { ConsumeStockBatchUseCase } from '../consume-stock-batch/consume-stock-batch.use-case';
import { UndoConsumptionCommand } from '../undo-consumption/undo-consumption.command';
import { UndoConsumptionUseCase } from '../undo-consumption/undo-consumption.use-case';
import { ConfirmConsumptionCommand } from './confirm-consumption.command';
import { ConfirmConsumptionUseCase } from './confirm-consumption.use-case';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_OPERATION_ID = '77777777-7777-4777-8777-777777777777';

function buildStockedItem(id: string, quantity: number): InventoryItem {
  const item = InventoryItem.create({
    id: InventoryItemId.create(id),
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
  item.replenish({
    quantity,
    unitPrice: Money.fromCents(2500),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create('55555555-5555-4555-8555-555555555555'),
    now: new Date(),
  });
  item.pullDomainEvents();
  return item;
}

// The consumptions come from the real consume use case, so each carries the operation id the way a
// withdrawal leaves it.
async function makeUseCases() {
  const items = new InMemoryInventoryItemRepository();
  const idGenerator = new FakeIdGenerator();
  const clock = new FakeClock();
  const events = new RecordingDomainEventPublisher();
  const transactionRunner = new FakeTransactionRunner();
  await items.save(buildStockedItem(ITEM_A_ID, 5));
  await items.save(buildStockedItem(ITEM_B_ID, 5));
  const consume = (
    operationId: string,
    lines: Array<{ inventoryItemId: string; quantity: number }>,
  ) =>
    new ConsumeStockBatchUseCase(items, transactionRunner, idGenerator, clock, events).execute(
      new ConsumeStockBatchCommand(lines, WORK_ORDER_ID, ACTOR_ID, operationId),
    );
  const undo = (operationId: string) =>
    new UndoConsumptionUseCase(items, transactionRunner, idGenerator, clock, events).execute(
      new UndoConsumptionCommand(operationId, ACTOR_ID),
    );
  const confirm = (operationId: string) =>
    new ConfirmConsumptionUseCase(items, clock).execute(
      new ConfirmConsumptionCommand(operationId, ACTOR_ID),
    );
  /** What each consumption and each return on the ledger says about its confirmation. */
  const confirmations = () =>
    items.ledgerEntries
      .filter((entry) => entry.kind !== StockMovementKind.Inbound)
      .map((entry) => [entry.kind, entry.operationId, entry.confirmedAt]);
  return { items, clock, consume, undo, confirm, confirmations };
}

describe('ConfirmConsumptionUseCase', () => {
  it('sets the time of the clock on every consumption the operation wrote, on each item it touched', async () => {
    const { consume, confirm, confirmations, clock } = await makeUseCases();
    await consume(OPERATION_ID, [
      { inventoryItemId: ITEM_A_ID, quantity: 2 },
      { inventoryItemId: ITEM_B_ID, quantity: 1 },
    ]);
    expect(confirmations().map(([, , confirmedAt]) => confirmedAt)).toEqual([null, null]);
    clock.advanceSeconds(30);

    await confirm(OPERATION_ID);

    expect(confirmations()).toEqual([
      [StockMovementKind.Consumption, OPERATION_ID, clock.now()],
      [StockMovementKind.Consumption, OPERATION_ID, clock.now()],
    ]);
  });

  it('leaves the consumptions of another operation on the same work order alone', async () => {
    const { consume, confirm, confirmations, clock } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    await consume(OTHER_OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 1 }]);

    await confirm(OPERATION_ID);

    expect(confirmations()).toEqual([
      [StockMovementKind.Consumption, OPERATION_ID, clock.now()],
      [StockMovementKind.Consumption, OTHER_OPERATION_ID, null],
    ]);
  });

  it('keeps the time of the first confirmation when it is repeated later', async () => {
    const { consume, confirm, confirmations, clock } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    const firstConfirmation = clock.now();
    await confirm(OPERATION_ID);
    clock.advanceSeconds(60);

    await confirm(OPERATION_ID);

    expect(confirmations()).toEqual([
      [StockMovementKind.Consumption, OPERATION_ID, firstConfirmation],
    ]);
  });

  it('changes nothing for an operation that consumed nothing', async () => {
    const { items, consume, confirm } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    const ledgerBefore = items.ledgerEntries;

    await confirm(OTHER_OPERATION_ID);

    expect(items.ledgerEntries).toEqual(ledgerBefore);
  });

  it('sets the time on consumptions only, not on the returns an undo tagged with the same operation id', async () => {
    const { consume, undo, confirm, confirmations, clock } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    await undo(OPERATION_ID);

    await confirm(OPERATION_ID);

    expect(confirmations()).toEqual([
      [StockMovementKind.Consumption, OPERATION_ID, clock.now()],
      [StockMovementKind.Return, OPERATION_ID, null],
    ]);
  });
});
