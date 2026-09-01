import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { RestoreStockBatchCommand } from './restore-stock-batch.command';
import { RestoreStockBatchHandler } from './restore-stock-batch.handler';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';

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

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const eventBus = stubEventBus();
  const handler = new RestoreStockBatchHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    eventBus.bus,
  );
  return { handler, items, eventBus };
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

describe('RestoreStockBatchHandler', () => {
  it('draws from the single pending consumption when one covers the whole return', async () => {
    const { handler, items } = makeHandler();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await handler.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
        WORK_ORDER_ID,
        ACTOR_ID,
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
    const { handler, items } = makeHandler();
    // Two separate withdrawals of the same item, on the same work order: 2 units, then 3 units.
    await replenishAndConsume(items, ITEM_A_ID, [2, 3]);

    await handler.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 4 }],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    const updated = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(updated?.quantityOnHand.units).toBe(9); // 10 - 5 withdrawn + 4 returned
    const returns = updated?.newMovements.filter(
      (movement) => movement.kind === StockMovementKind.Return,
    );
    expect(returns).toHaveLength(2);
    // Newest consumption (3 units) drawn from first and fully drained, then 1 more from the older one.
    expect(returns?.map((movement) => movement.quantity).sort()).toEqual([1, 3]);
  });

  it('never edits the original consumption, and marks it fully drained after a full return', async () => {
    const { handler, items } = makeHandler();
    await replenishAndConsume(items, ITEM_A_ID, [2]);
    const consumptionId = items.items
      .find((item) => item.id.value === ITEM_A_ID)
      ?.newMovements.find((movement) => movement.kind === StockMovementKind.Consumption)?.id.value;

    await handler.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 2 }],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    const stillPending = await items.findPendingConsumptions(
      InventoryItemId.create(ITEM_A_ID),
      WORK_ORDER_ID,
    );
    expect(stillPending.some((entry) => entry.movementId === consumptionId)).toBe(false);
  });

  it('refuses with InventoryItemNotFoundError when an addressed id matches no item', async () => {
    const { handler, items } = makeHandler();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await expect(
      handler.execute(
        new RestoreStockBatchCommand(
          [{ inventoryItemId: ITEM_B_ID, quantity: 1 }],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
  });

  it('saves nothing when a later line in the batch is refused', async () => {
    const { handler, items } = makeHandler();
    await replenishAndConsume(items, ITEM_A_ID, [2]);

    await expect(
      handler.execute(
        new RestoreStockBatchCommand(
          [
            { inventoryItemId: ITEM_A_ID, quantity: 1 },
            { inventoryItemId: ITEM_B_ID, quantity: 1 },
          ],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);

    const untouchedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(untouchedA?.quantityOnHand.units).toBe(8);
  });
});
