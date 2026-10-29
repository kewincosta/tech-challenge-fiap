import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemDeactivated } from '../../../domain/events/inventory-item-deactivated.event';
import { InventoryItemInUseError } from '../../../domain/errors/inventory-item-in-use.error';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemStatus } from '../../../domain/inventory-item-status';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { InventoryQueryPort } from '../../ports/inventory-query.port';
import { DeactivateInventoryItemCommand } from './deactivate-inventory-item.command';
import { DeactivateInventoryItemHandler } from './deactivate-inventory-item.handler';

const ITEM_ID = InventoryItemId.create('11111111-1111-4111-8111-111111111111');
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';

function fakePort(openWorkOrders: string[] = []): InventoryQueryPort {
  return {
    getById: vi.fn(),
    listActive: vi.fn(),
    listMovements: vi.fn(),
    listStockShortages: vi.fn(),
    listOpenWorkOrderNumbersUsing: vi.fn().mockResolvedValue(openWorkOrders),
  };
}

function makeHandler(openWorkOrders: string[] = []) {
  const items = new InMemoryInventoryItemRepository();
  const inventoryQuery = fakePort(openWorkOrders);
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new DeactivateInventoryItemHandler(items, inventoryQuery, clock, events);
  return { handler, items, inventoryQuery, events, clock };
}

// A stored item has no pending events, like one the repository loaded.
function buildItem(): InventoryItem {
  const item = InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    description: 'Filtro padrao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  item.pullDomainEvents();
  return item;
}

describe('DeactivateInventoryItemHandler', () => {
  it('should flip the status to INACTIVE and keep the record', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));

    expect(items.items).toHaveLength(1);
    expect(items.items[0].status).toBe(InventoryItemStatus.Inactive);
  });

  it('should leave the quantity on hand untouched - only a movement moves the count', async () => {
    const { handler, items } = makeHandler();
    const item = buildItem();
    item.replenish({
      quantity: 12,
      unitPrice: Money.fromCents(2500),
      actorUserId: '22222222-2222-4222-8222-222222222222',
      movementId: StockMovementId.create('33333333-3333-4333-8333-333333333333'),
      now: new Date('2026-08-31T12:00:00.000Z'),
    });
    await items.save(item);

    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));

    expect(items.items[0].quantityOnHand.units).toBe(12);
  });

  it('should free the SKU for a new active item', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItem());

    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));

    await expect(items.existsActiveBySku(Sku.create('FLT-001'))).resolves.toBe(false);
  });

  it('should refuse an item planned on a work order that is still open', async () => {
    const { handler, items } = makeHandler(['A1B090-2026', 'C7D410-2026']);
    await items.save(buildItem());

    await expect(
      handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value)),
    ).rejects.toThrow(InventoryItemInUseError);
    expect(items.items[0].status).toBe(InventoryItemStatus.Active);
  });

  it('should name the blocking work orders in the error, so the caller needs no second lookup', async () => {
    const { handler, items } = makeHandler(['A1B090-2026']);
    await items.save(buildItem());

    await expect(
      handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value)),
    ).rejects.toMatchObject({ workOrderNumbers: ['A1B090-2026'] });
  });

  it('should be idempotent when deactivated twice, without re-running the in-use check', async () => {
    const { handler, items, inventoryQuery } = makeHandler();
    await items.save(buildItem());
    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));
    // A work order planned after the deactivation would turn the second call into a 409 for a
    // state that never changed, if that call ran the in-use check again.
    vi.mocked(inventoryQuery.listOpenWorkOrderNumbersUsing).mockResolvedValue(['A1B090-2026']);

    await expect(
      handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value)),
    ).resolves.toBeUndefined();
    expect(items.items[0].status).toBe(InventoryItemStatus.Inactive);
  });

  it('should publish the deactivation once, and nothing on the second call', async () => {
    const { handler, items, events, clock } = makeHandler();
    await items.save(buildItem());

    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));
    expect(events.published).toEqual([new InventoryItemDeactivated(ITEM_ID.value, clock.now())]);

    await handler.execute(new DeactivateInventoryItemCommand(ITEM_ID.value));
    expect(events.published).toHaveLength(1);
  });

  it('should refuse an unknown item', async () => {
    const { handler } = makeHandler();

    await expect(handler.execute(new DeactivateInventoryItemCommand(UNKNOWN_ID))).rejects.toThrow(
      InventoryItemNotFoundError,
    );
  });
});
