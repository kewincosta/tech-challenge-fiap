import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { SettleStockMovementsCommand } from './settle-stock-movements.command';
import { SettleStockMovementsHandler } from './settle-stock-movements.handler';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORK_ORDER_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = InventoryItemId.create('44444444-4444-4444-8444-444444444444');
const CONSUMPTION_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_CONSUMPTION_ID = '66666666-6666-4666-8666-666666666666';
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

describe('SettleStockMovementsHandler', () => {
  it("settles the work order's pending consumptions and no other work order's, with the actor and the clock's moment", async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    const handler = new SettleStockMovementsHandler(items, new FakeClock(NOW));

    await handler.execute(new SettleStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID));

    expect(await items.findPendingConsumptions(ITEM_ID, WORK_ORDER_ID)).toEqual([]);
    expect(await items.findPendingConsumptions(ITEM_ID, OTHER_WORK_ORDER_ID)).toEqual([
      { movementId: OTHER_CONSUMPTION_ID, quantity: 2 },
    ]);
    expect(items.settlements).toEqual([
      { workOrderId: WORK_ORDER_ID, actorUserId: ACTOR_ID, now: NOW },
    ]);
  });

  it('settles nothing and does not throw for a work order with no pending consumption', async () => {
    const items = new InMemoryInventoryItemRepository();
    await seedConsumptions(items);
    const handler = new SettleStockMovementsHandler(items, new FakeClock(NOW));

    await expect(
      handler.execute(
        new SettleStockMovementsCommand('88888888-8888-4888-8888-888888888888', ACTOR_ID),
      ),
    ).resolves.not.toThrow();

    expect(await items.findPendingConsumptions(ITEM_ID, WORK_ORDER_ID)).toHaveLength(1);
    expect(await items.findPendingConsumptions(ITEM_ID, OTHER_WORK_ORDER_ID)).toHaveLength(1);
  });

  it('lets an error from the repository travel out untouched', async () => {
    class FailingItems extends InMemoryInventoryItemRepository {
      override settleWorkOrderConsumptions(): Promise<number> {
        return Promise.reject(new Error('boom'));
      }
    }
    const handler = new SettleStockMovementsHandler(new FailingItems(), new FakeClock());

    await expect(
      handler.execute(new SettleStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)),
    ).rejects.toThrow('boom');
  });
});
