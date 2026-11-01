import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeTransactionRunner } from '../../../../../../test/support/fakes/fake-transaction-runner';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { StockMovementStatus } from '../../../domain/stock-movement-status';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { WriteOffStockMovementsCommand } from './write-off-stock-movements.command';
import { WriteOffStockMovementsUseCase } from './write-off-stock-movements.use-case';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORK_ORDER_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = InventoryItemId.create('44444444-4444-4444-8444-444444444444');
const CONSUMPTION_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_CONSUMPTION_ID = '66666666-6666-4666-8666-666666666666';
const IN_FLIGHT_CONSUMPTION_ID = '88888888-8888-4888-8888-888888888888';
const OPERATION_ID = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-08-31T12:00:00.000Z');

// An item that withdrew 2 units for each of two work orders, stored the way the repository keeps it.
async function seedConsumptions(items: InMemoryInventoryItemRepository): Promise<void> {
  const item = InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: NOW,
  });
  item.replenish({
    quantity: 10,
    unitPrice: Money.fromCents(2500),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create('77777777-7777-4777-8777-777777777777'),
    now: NOW,
  });
  item.consume({
    quantity: 2,
    workOrderId: WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(CONSUMPTION_ID),
    now: NOW,
  });
  item.consume({
    quantity: 2,
    workOrderId: OTHER_WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(OTHER_CONSUMPTION_ID),
    now: NOW,
  });
  await items.save(item);
}

// A withdrawal in flight on the first work order: its consumption carries an operation id and has no
// confirmation yet.
async function consumeInFlight(items: InMemoryInventoryItemRepository): Promise<void> {
  const [item] = await items.findAllByIdsForUpdate([ITEM_ID]);
  item.consume({
    quantity: 3,
    workOrderId: WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(IN_FLIGHT_CONSUMPTION_ID),
    operationId: OPERATION_ID,
    now: NOW,
  });
  await items.save(item);
}

function consumptionStatuses(items: InMemoryInventoryItemRepository) {
  return items.ledgerEntries
    .filter((entry) => entry.kind === StockMovementKind.Consumption)
    .map((entry) => [entry.movementId, entry.status]);
}

describe('WriteOffStockMovementsUseCase', () => {
  it("writes off the work order's outstanding consumptions and no other work order's, with the actor and the clock's moment", async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    const useCase = new WriteOffStockMovementsUseCase(
      items,
      new FakeTransactionRunner(),
      new FakeClock(NOW),
    );

    await useCase.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID));

    expect(await items.findPendingConsumptions(ITEM_ID, WORK_ORDER_ID)).toEqual([]);
    expect(await items.findPendingConsumptions(ITEM_ID, OTHER_WORK_ORDER_ID)).toEqual([
      { movementId: OTHER_CONSUMPTION_ID, quantity: 2 },
    ]);
    expect(items.writeOffs).toEqual([
      { workOrderId: WORK_ORDER_ID, actorUserId: ACTOR_ID, now: NOW },
    ]);
  });

  it('writes off nothing and does not throw for a work order with no outstanding consumption', async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    const useCase = new WriteOffStockMovementsUseCase(
      items,
      new FakeTransactionRunner(),
      new FakeClock(NOW),
    );

    await expect(
      useCase.execute(
        new WriteOffStockMovementsCommand('88888888-8888-4888-8888-888888888888', ACTOR_ID),
      ),
    ).resolves.not.toThrow();

    expect(await items.findPendingConsumptions(ITEM_ID, WORK_ORDER_ID)).toHaveLength(1);
    expect(await items.findPendingConsumptions(ITEM_ID, OTHER_WORK_ORDER_ID)).toHaveLength(1);
  });

  it('leaves the consumption of a withdrawal its work order has not confirmed as it is, and writes it off once it is confirmed', async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    await consumeInFlight(items);
    const useCase = new WriteOffStockMovementsUseCase(
      items,
      new FakeTransactionRunner(),
      new FakeClock(NOW),
    );
    const command = new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID);

    await useCase.execute(command);

    expect(consumptionStatuses(items)).toEqual([
      [CONSUMPTION_ID, StockMovementStatus.WrittenOff],
      [OTHER_CONSUMPTION_ID, StockMovementStatus.Pending],
      [IN_FLIGHT_CONSUMPTION_ID, StockMovementStatus.Pending],
    ]);

    await items.confirmConsumptionsOfOperation(OPERATION_ID, NOW);
    await useCase.execute(command);

    expect(consumptionStatuses(items)).toEqual([
      [CONSUMPTION_ID, StockMovementStatus.WrittenOff],
      [OTHER_CONSUMPTION_ID, StockMovementStatus.Pending],
      [IN_FLIGHT_CONSUMPTION_ID, StockMovementStatus.WrittenOff],
    ]);
  });

  it('lets an error from the repository travel out untouched', async () => {
    class FailingItems extends InMemoryInventoryItemRepository {
      override writeOffWorkOrderConsumptions(): Promise<number> {
        return Promise.reject(new Error('boom'));
      }
    }
    const useCase = new WriteOffStockMovementsUseCase(
      new FailingItems(),
      new FakeTransactionRunner(),
      new FakeClock(),
    );

    await expect(
      useCase.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)),
    ).rejects.toThrow('boom');
  });

  it('runs the repository call inside a transaction of its own', async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    const transactionRunner = new FakeTransactionRunner();
    const useCase = new WriteOffStockMovementsUseCase(
      transactionRunner.watch('items', items),
      transactionRunner,
      new FakeClock(NOW),
    );

    await useCase.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID));

    expect(transactionRunner.runCalls).toBe(1);
    expect(transactionRunner.calls).toEqual(['items.writeOffWorkOrderConsumptions']);
    expect(transactionRunner.callsInside).toEqual(['items.writeOffWorkOrderConsumptions']);
  });
});
