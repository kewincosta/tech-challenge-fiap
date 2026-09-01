import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { ConsumeStockBatchCommand } from './consume-stock-batch.command';
import { ConsumeStockBatchHandler } from './consume-stock-batch.handler';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';

function buildStockedItem(id: string, quantity: number, priceCents = 2500): InventoryItem {
  const item = InventoryItem.create({
    id: InventoryItemId.create(id),
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(priceCents),
    now: new Date(),
  });
  item.replenish({
    quantity,
    unitPrice: Money.fromCents(priceCents),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create('55555555-5555-4555-8555-555555555555'),
    now: new Date(),
  });
  item.pullDomainEvents();
  return item;
}

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const eventBus = stubEventBus();
  const handler = new ConsumeStockBatchHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    eventBus.bus,
  );
  return { handler, items, eventBus };
}

describe('ConsumeStockBatchHandler', () => {
  it('applies one consumption per line and returns one minted movement id per line', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildStockedItem(ITEM_A_ID, 5));
    await items.save(buildStockedItem(ITEM_B_ID, 5));

    const results = await handler.execute(
      new ConsumeStockBatchCommand(
        [
          { inventoryItemId: ITEM_A_ID, quantity: 2 },
          { inventoryItemId: ITEM_B_ID, quantity: 1 },
        ],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    expect(results).toHaveLength(2);
    expect(results.every((line) => line.movementId)).toBe(true);
    expect(new Set(results.map((line) => line.movementId)).size).toBe(2);
    const updatedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    const updatedB = items.items.find((item) => item.id.value === ITEM_B_ID);
    expect(updatedA?.quantityOnHand.units).toBe(3);
    expect(updatedB?.quantityOnHand.units).toBe(4);
  });

  it("writes the item's own catalog price on the movement, not anything the command supplies", async () => {
    const { handler, items } = makeHandler();
    await items.save(buildStockedItem(ITEM_A_ID, 5, 4321));

    await handler.execute(
      new ConsumeStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 1 }],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    const updated = items.items.find((item) => item.id.value === ITEM_A_ID);
    const movement = updated?.newMovements[0];
    expect(movement?.unitPrice.cents).toBe(4321);
  });

  it('refuses the whole command with InsufficientStockError when any line exceeds its count on hand', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildStockedItem(ITEM_A_ID, 5));
    await items.save(buildStockedItem(ITEM_B_ID, 1));

    await expect(
      handler.execute(
        new ConsumeStockBatchCommand(
          [
            { inventoryItemId: ITEM_A_ID, quantity: 2 },
            { inventoryItemId: ITEM_B_ID, quantity: 5 },
          ],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InsufficientStockError);
  });

  it('refuses with InventoryItemNotFoundError when an addressed id matches no item', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildStockedItem(ITEM_A_ID, 5));

    await expect(
      handler.execute(
        new ConsumeStockBatchCommand(
          [{ inventoryItemId: ITEM_B_ID, quantity: 1 }],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
  });

  it('saves nothing when a later line in the batch is refused', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildStockedItem(ITEM_A_ID, 5));
    await items.save(buildStockedItem(ITEM_B_ID, 1));

    await expect(
      handler.execute(
        new ConsumeStockBatchCommand(
          [
            { inventoryItemId: ITEM_A_ID, quantity: 2 },
            { inventoryItemId: ITEM_B_ID, quantity: 5 },
          ],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InsufficientStockError);

    const untouchedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(untouchedA?.quantityOnHand.units).toBe(5);
  });
});
