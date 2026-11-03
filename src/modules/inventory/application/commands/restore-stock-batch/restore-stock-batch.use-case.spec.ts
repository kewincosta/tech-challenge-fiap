import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { RestoreStockBatchCommand } from './restore-stock-batch.command';
import { RestoreStockBatchUseCase } from './restore-stock-batch.use-case';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';
const WITHDRAWAL_OPERATION_ID = '99999999-9999-4999-8999-999999999999';

function buildItem(id: string): InventoryItem {
  return InventoryItem.create({
    id: InventoryItemId.create(id),
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
}

function makeUseCase() {
  const items = new InMemoryInventoryItemRepository();
  const transactionRunner = new FakeTransactionRunner();
  const useCase = new RestoreStockBatchUseCase(
    transactionRunner.watch('items', items),
    transactionRunner,
    new FakeIdGenerator(),
    new FakeClock(),
    new RecordingDomainEventPublisher(),
  );
  return { useCase, items, transactionRunner };
}

async function replenishAndConsume(
  items: InMemoryInventoryItemRepository,
  id: string,
  consumptions: number[],
): Promise<void> {
  const item = buildItem(id);
  item.replenish({
    quantity: 10,
    unitPrice: Money.fromCents(2500),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(`${id.slice(0, 8)}-0000-4000-8000-000000000000`),
    now: new Date('2026-08-31T09:00:00.000Z'),
  });
  await items.save(item);

  let offset = 1;
  for (const quantity of consumptions) {
    const loaded = await items.findAllByIdsForUpdate([InventoryItemId.create(id)]);
    loaded[0].consume({
      quantity,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: StockMovementId.create(`${id.slice(0, 8)}-0000-4000-8000-00000000000${offset}`),
      now: new Date(`2026-08-31T10:0${offset}:00.000Z`),
    });
    await items.save(loaded[0]);
    offset += 1;
  }
}

// A withdrawal in flight on the work order: its consumption is the newest, carries an operation id
// and has no confirmation yet.
async function consumeInFlight(
  items: InMemoryInventoryItemRepository,
  id: string,
  quantity: number,
): Promise<void> {
  const [item] = await items.findAllByIdsForUpdate([InventoryItemId.create(id)]);
  item.consume({
    quantity,
    workOrderId: WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(`${id.slice(0, 8)}-0000-4000-8000-000000000009`),
    operationId: WITHDRAWAL_OPERATION_ID,
    now: new Date('2026-08-31T11:00:00.000Z'),
  });
  await items.save(item);
}

describe('RestoreStockBatchUseCase', () => {
  it('draws from the single pending consumption when one covers the whole return', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const updated = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(updated?.quantityOnHand.units).toBe(9);
    const returnMovement = updated?.newMovements.find(
      (movement) => movement.kind === StockMovementKind.Return,
    );
    expect(returnMovement?.quantity).toBe(1);
  });

  it('splits one return across two consumptions, drawing the newest one first', async () => {
    const { useCase, items } = makeUseCase();
    // Two separate withdrawals of the same item, on the same work order: 2 units, then 3 units.
    await replenishAndConsume(items, ITEM_A_ID, [2, 3]);

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 4 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const updated = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(updated?.quantityOnHand.units).toBe(9); // 10 - 5 withdrawn + 4 returned
    const returns = updated?.newMovements.filter(
      (movement) => movement.kind === StockMovementKind.Return,
    );
    expect(returns).toHaveLength(2);
    // Newest consumption (3 units, movement id ...0002) drawn from first and fully drained, then
    // 1 more from the older one (2 units, movement id ...0001) - each RETURN must point at its
    // own consumption, not both at the same one (validation.md's P2, round 3).
    const newestConsumptionId = `${ITEM_A_ID.slice(0, 8)}-0000-4000-8000-000000000002`;
    const oldestConsumptionId = `${ITEM_A_ID.slice(0, 8)}-0000-4000-8000-000000000001`;
    const fromNewest = returns?.find((movement) => movement.quantity === 3);
    const fromOldest = returns?.find((movement) => movement.quantity === 1);
    expect(fromNewest?.undoesMovementId).toBe(newestConsumptionId);
    expect(fromOldest?.undoesMovementId).toBe(oldestConsumptionId);
  });

  it('draws only from confirmed consumptions, so the units of a withdrawal in flight stay for its undo', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    await consumeInFlight(items, ITEM_A_ID, 3);

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 2 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const oldestConsumptionId = `${ITEM_A_ID.slice(0, 8)}-0000-4000-8000-000000000001`;
    const returns = items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Return);
    expect(returns.map((entry) => [entry.quantity, entry.undoesMovementId])).toEqual([
      [2, oldestConsumptionId],
    ]);
    expect(await items.findPendingConsumptionsOfOperation(WITHDRAWAL_OPERATION_ID)).toMatchObject([
      { quantity: 3 },
    ]);
  });

  it('draws from the consumption of a withdrawal once its work order confirmed it, the newest first', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    await consumeInFlight(items, ITEM_A_ID, 3);
    await items.confirmConsumptionsOfOperation(WITHDRAWAL_OPERATION_ID, new Date());

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 4 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const oldestConsumptionId = `${ITEM_A_ID.slice(0, 8)}-0000-4000-8000-000000000001`;
    const newestConsumptionId = `${ITEM_A_ID.slice(0, 8)}-0000-4000-8000-000000000009`;
    const returns = items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Return);
    expect(returns.map((entry) => [entry.quantity, entry.undoesMovementId])).toEqual([
      [3, newestConsumptionId],
      [1, oldestConsumptionId],
    ]);
  });

  it('never edits the original consumption, and marks it fully drained after a full return', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    const consumptionId = items.items
      .find((item) => item.id.value === ITEM_A_ID)
      ?.newMovements.find((movement) => movement.kind === StockMovementKind.Consumption)?.id.value;

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 2 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const stillPending = await items.findPendingConsumptions(
      InventoryItemId.create(ITEM_A_ID),
      WORK_ORDER_ID,
    );
    expect(stillPending.some((entry) => entry.movementId === consumptionId)).toBe(false);
  });

  it('refuses with InventoryItemNotFoundError when an addressed id matches no item', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await expect(
      useCase.execute(
        new RestoreStockBatchCommand(
          [{ inventoryItemId: ITEM_B_ID, quantity: 1 }],
          WORK_ORDER_ID,
          ACTOR_ID,
          OPERATION_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
  });

  it('saves nothing when a later line in the batch is refused', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await expect(
      useCase.execute(
        new RestoreStockBatchCommand(
          [
            { inventoryItemId: ITEM_A_ID, quantity: 1 },
            { inventoryItemId: ITEM_B_ID, quantity: 1 },
          ],
          WORK_ORDER_ID,
          ACTOR_ID,
          OPERATION_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);

    const untouchedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(untouchedA?.quantityOnHand.units).toBe(8);
  });

  it('tags every return it writes with the operation id of the command', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2, 3]);

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 4 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    const returns = items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Return);
    expect(returns.map((entry) => entry.operationId)).toEqual([OPERATION_ID, OPERATION_ID]);
  });

  it('changes nothing when it is repeated with the operation id of a restore already applied', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    const command = new RestoreStockBatchCommand(
      [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
      WORK_ORDER_ID,
      ACTOR_ID,
      OPERATION_ID,
    );
    await useCase.execute(command);
    const ledgerAfterFirst = items.ledgerEntries;

    await useCase.execute(command);

    expect(items.items.find((item) => item.id.value === ITEM_A_ID)?.quantityOnHand.units).toBe(9);
    expect(items.ledgerEntries).toEqual(ledgerAfterFirst);
  });

  it('applies a second restore that carries another operation id', async () => {
    const { useCase, items } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    const restoreOne = (operationId: string) =>
      useCase.execute(
        new RestoreStockBatchCommand(
          [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
          WORK_ORDER_ID,
          ACTOR_ID,
          operationId,
        ),
      );

    await restoreOne(OPERATION_ID);
    await restoreOne('77777777-7777-4777-8777-777777777777');

    expect(items.items.find((item) => item.id.value === ITEM_A_ID)?.quantityOnHand.units).toBe(10);
    expect(
      items.ledgerEntries.filter((entry) => entry.kind === StockMovementKind.Return),
    ).toHaveLength(2);
  });

  it('opens a transaction of its own and locks the items, checks the operation and saves them inside it', async () => {
    const { useCase, items, transactionRunner } = makeUseCase();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await useCase.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
        WORK_ORDER_ID,
        ACTOR_ID,
        OPERATION_ID,
      ),
    );

    expect(transactionRunner.runCalls).toBe(1);
    expect(transactionRunner.calls).toEqual([
      'items.findAllByIdsForUpdate',
      'items.hasReturnOfOperation',
      'items.findPendingConsumptions',
      'items.save',
    ]);
    expect(transactionRunner.callsInside).toEqual(transactionRunner.calls);
  });
});
