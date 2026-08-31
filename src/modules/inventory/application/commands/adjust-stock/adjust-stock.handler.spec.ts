import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { AdjustmentNoteRequiredError } from '../../../domain/errors/adjustment-note-required.error';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InvalidMovementQuantityError } from '../../../domain/errors/invalid-movement-quantity.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { AdjustStockCommand } from './adjust-stock.command';
import { AdjustStockHandler } from './adjust-stock.handler';

const ITEM_ID = InventoryItemId.create('11111111-1111-4111-8111-111111111111');
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const handler = new AdjustStockHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    stubEventBus().bus,
  );
  return { handler, items };
}

function buildItemWithStock(units = 10): InventoryItem {
  const item = InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  item.replenish({
    quantity: units,
    unitPrice: Money.fromCents(2500),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create('33333333-3333-4333-8333-333333333333'),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  return item;
}

describe('AdjustStockHandler', () => {
  it('should lower the count and append exactly one ADJUSTMENT movement', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithStock(10));

    await handler.execute(
      new AdjustStockCommand(ITEM_ID.value, 3, ACTOR_ID, 'Contagem divergente'),
    );

    const updated = items.items[0];
    expect(updated.quantityOnHand.units).toBe(7);
    const adjustments = updated.newMovements.filter((m) => m.kind === StockMovementKind.Adjustment);
    expect(adjustments).toHaveLength(1);
  });

  it('should refuse an adjustment with no note', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithStock(10));

    await expect(
      handler.execute(new AdjustStockCommand(ITEM_ID.value, 3, ACTOR_ID, '')),
    ).rejects.toThrow(AdjustmentNoteRequiredError);
    expect(items.items[0].quantityOnHand.units).toBe(10);
  });

  it('should refuse a zero or negative quantity', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithStock(10));

    await expect(
      handler.execute(new AdjustStockCommand(ITEM_ID.value, 0, ACTOR_ID, 'nota')),
    ).rejects.toThrow(InvalidMovementQuantityError);
    await expect(
      handler.execute(new AdjustStockCommand(ITEM_ID.value, -1, ACTOR_ID, 'nota')),
    ).rejects.toThrow(InvalidMovementQuantityError);
    expect(items.items[0].quantityOnHand.units).toBe(10);
  });

  it('should refuse an adjustment below zero with InsufficientStockError and persist nothing', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithStock(5));

    await expect(
      handler.execute(new AdjustStockCommand(ITEM_ID.value, 6, ACTOR_ID, 'nota')),
    ).rejects.toThrow(InsufficientStockError);
    expect(items.items[0].quantityOnHand.units).toBe(5);
    expect(
      items.items[0].newMovements.filter((m) => m.kind === StockMovementKind.Adjustment),
    ).toHaveLength(0);
  });

  it('should refuse an unknown item and write nothing', async () => {
    const { handler, items } = makeHandler();

    await expect(
      handler.execute(
        new AdjustStockCommand('00000000-0000-4000-8000-000000000001', 1, ACTOR_ID, 'nota'),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
    expect(items.items).toHaveLength(0);
  });
});
