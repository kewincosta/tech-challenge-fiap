import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import {
  InMemoryInventoryItemRepository,
  LedgerEntry,
} from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { StockMovementStatus } from '../../../domain/stock-movement-status';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { ConsumeStockBatchCommand } from '../consume-stock-batch/consume-stock-batch.command';
import { ConsumeStockBatchUseCase } from '../consume-stock-batch/consume-stock-batch.use-case';
import { RestoreStockBatchCommand } from '../restore-stock-batch/restore-stock-batch.command';
import { RestoreStockBatchUseCase } from '../restore-stock-batch/restore-stock-batch.use-case';
import { UndoConsumptionCommand } from './undo-consumption.command';
import { UndoConsumptionUseCase } from './undo-consumption.use-case';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const WITHDRAWER_ID = '33333333-3333-4333-8333-333333333333';
const UNDOER_ID = '99999999-9999-4999-8999-999999999999';
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
    actorUserId: WITHDRAWER_ID,
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
  await items.save(buildStockedItem(ITEM_A_ID, 5));
  await items.save(buildStockedItem(ITEM_B_ID, 5));
  const consume = (
    operationId: string,
    lines: Array<{ inventoryItemId: string; quantity: number }>,
  ) =>
    new ConsumeStockBatchUseCase(items, idGenerator, clock, events).execute(
      new ConsumeStockBatchCommand(lines, WORK_ORDER_ID, WITHDRAWER_ID, operationId),
    );
  const restore = (inventoryItemId: string, quantity: number, operationId: string) =>
    new RestoreStockBatchUseCase(items, idGenerator, clock, events).execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId, quantity }],
        WORK_ORDER_ID,
        WITHDRAWER_ID,
        operationId,
      ),
    );
  const undo = (operationId: string) =>
    new UndoConsumptionUseCase(items, idGenerator, clock, events).execute(
      new UndoConsumptionCommand(operationId, UNDOER_ID),
    );
  const quantityOf = (id: string) =>
    items.items.find((item) => item.id.value === id)?.quantityOnHand.units;
  return { items, consume, restore, undo, quantityOf };
}

describe('UndoConsumptionUseCase', () => {
  it('returns the units of every consumption the operation wrote, on each item it touched', async () => {
    const { consume, undo, quantityOf } = await makeUseCases();
    await consume(OPERATION_ID, [
      { inventoryItemId: ITEM_A_ID, quantity: 2 },
      { inventoryItemId: ITEM_B_ID, quantity: 1 },
    ]);
    expect([quantityOf(ITEM_A_ID), quantityOf(ITEM_B_ID)]).toEqual([3, 4]);

    await undo(OPERATION_ID);

    expect([quantityOf(ITEM_A_ID), quantityOf(ITEM_B_ID)]).toEqual([5, 5]);
  });

  it('writes one return per consumption, linked to the work order, tagged with the operation id and attributed to the actor of the undo', async () => {
    const { items, consume, undo } = await makeUseCases();
    await consume(OPERATION_ID, [
      { inventoryItemId: ITEM_A_ID, quantity: 2 },
      { inventoryItemId: ITEM_B_ID, quantity: 1 },
    ]);
    // The order in which the items are saved is the repository's business, so the entries are read
    // by item.
    const byItem = (entries: readonly LedgerEntry[]) =>
      [...entries].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId));
    const consumptions = byItem(
      items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Consumption),
    );

    await undo(OPERATION_ID);

    const returns = byItem(
      items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Return),
    );
    expect(
      returns.map(({ inventoryItemId, quantity, workOrderId, operationId, actorUserId }) => ({
        inventoryItemId,
        quantity,
        workOrderId,
        operationId,
        actorUserId,
      })),
    ).toEqual([
      {
        inventoryItemId: ITEM_A_ID,
        quantity: 2,
        workOrderId: WORK_ORDER_ID,
        operationId: OPERATION_ID,
        actorUserId: UNDOER_ID,
      },
      {
        inventoryItemId: ITEM_B_ID,
        quantity: 1,
        workOrderId: WORK_ORDER_ID,
        operationId: OPERATION_ID,
        actorUserId: UNDOER_ID,
      },
    ]);
    expect(returns.map((entry) => entry.undoesMovementId)).toEqual(
      consumptions.map((entry) => entry.movementId),
    );
  });

  it('keeps the consumption on the ledger, drained, so the history shows what happened', async () => {
    const { items, consume, undo } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);

    await undo(OPERATION_ID);

    const consumptions = items.ledgerEntries.filter(
      (entry) => entry.kind === StockMovementKind.Consumption,
    );
    expect(consumptions).toMatchObject([
      { quantity: 2, status: StockMovementStatus.Pending, operationId: OPERATION_ID },
    ]);
    expect(await items.findPendingConsumptionsOfOperation(OPERATION_ID)).toEqual([]);
  });

  it('changes nothing when it is repeated for the same operation', async () => {
    const { items, consume, undo, quantityOf } = await makeUseCases();
    await consume(OPERATION_ID, [
      { inventoryItemId: ITEM_A_ID, quantity: 2 },
      { inventoryItemId: ITEM_B_ID, quantity: 1 },
    ]);
    await undo(OPERATION_ID);
    const ledgerAfterFirst = items.ledgerEntries;

    await undo(OPERATION_ID);

    expect([quantityOf(ITEM_A_ID), quantityOf(ITEM_B_ID)]).toEqual([5, 5]);
    expect(items.ledgerEntries).toEqual(ledgerAfterFirst);
  });

  it('changes nothing for an operation that consumed nothing', async () => {
    const { items, consume, undo, quantityOf } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    const ledgerBefore = items.ledgerEntries;

    await undo(OTHER_OPERATION_ID);

    expect(quantityOf(ITEM_A_ID)).toBe(3);
    expect(items.ledgerEntries).toEqual(ledgerBefore);
  });

  it('returns only what is left on a consumption after an earlier return', async () => {
    const { items, consume, restore, undo, quantityOf } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 3 }]);
    await restore(ITEM_A_ID, 1, OTHER_OPERATION_ID);
    expect(quantityOf(ITEM_A_ID)).toBe(3);

    await undo(OPERATION_ID);

    expect(quantityOf(ITEM_A_ID)).toBe(5);
    const undoReturns = items.ledgerEntries.filter(
      (entry) => entry.kind === StockMovementKind.Return && entry.operationId === OPERATION_ID,
    );
    expect(undoReturns.map((entry) => entry.quantity)).toEqual([2]);
  });

  it('leaves the consumptions of another operation on the same work order alone', async () => {
    const { items, consume, undo, quantityOf } = await makeUseCases();
    await consume(OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 2 }]);
    await consume(OTHER_OPERATION_ID, [{ inventoryItemId: ITEM_A_ID, quantity: 1 }]);

    await undo(OPERATION_ID);

    expect(quantityOf(ITEM_A_ID)).toBe(4);
    expect(await items.findPendingConsumptionsOfOperation(OTHER_OPERATION_ID)).toMatchObject([
      { inventoryItemId: ITEM_A_ID, quantity: 1 },
    ]);
  });
});
