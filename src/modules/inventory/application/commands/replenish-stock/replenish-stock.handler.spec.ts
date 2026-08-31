import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InvalidMovementQuantityError } from '../../../domain/errors/invalid-movement-quantity.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { ReplenishStockCommand } from './replenish-stock.command';
import { ReplenishStockHandler } from './replenish-stock.handler';

const ITEM_ID = InventoryItemId.create('11111111-1111-4111-8111-111111111111');
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const handler = new ReplenishStockHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    stubEventBus().bus,
  );
  return { handler, items };
}

function buildItem(): InventoryItem {
  return InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
}

describe('ReplenishStockHandler', () => {
  it('should raise the count and append exactly one INBOUND movement carrying the acting user', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await handler.execute(
      new ReplenishStockCommand(ITEM_ID.value, 10, 2500, ACTOR_ID, 'Reposicao'),
    );

    const updated = items.items[0];
    expect(updated.quantityOnHand.units).toBe(10);
    expect(updated.newMovements).toHaveLength(1);
    expect(updated.newMovements[0].actorUserId).toBe(ACTOR_ID);
  });

  it('should accept a replenishment with no note', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await handler.execute(new ReplenishStockCommand(ITEM_ID.value, 5, 2500, ACTOR_ID));

    expect(items.items[0].newMovements[0].note).toBeNull();
  });

  it('should refuse a zero quantity', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await expect(
      handler.execute(new ReplenishStockCommand(ITEM_ID.value, 0, 2500, ACTOR_ID)),
    ).rejects.toThrow(InvalidMovementQuantityError);
    expect(items.items[0].quantityOnHand.units).toBe(0);
  });

  it('should refuse a negative quantity', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await expect(
      handler.execute(new ReplenishStockCommand(ITEM_ID.value, -1, 2500, ACTOR_ID)),
    ).rejects.toThrow(InvalidMovementQuantityError);
    expect(items.items[0].quantityOnHand.units).toBe(0);
  });

  it('should refuse an unknown item and write nothing', async () => {
    const { handler, items } = makeHandler();

    await expect(
      handler.execute(
        new ReplenishStockCommand('00000000-0000-4000-8000-000000000001', 10, 2500, ACTOR_ID),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
    expect(items.items).toHaveLength(0);
  });
});
