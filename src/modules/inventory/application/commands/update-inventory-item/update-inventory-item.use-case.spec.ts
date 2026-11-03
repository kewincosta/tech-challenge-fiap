import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemUpdated } from '../../../domain/events/inventory-item-updated.event';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { UpdateInventoryItemCommand } from './update-inventory-item.command';
import { UpdateInventoryItemUseCase } from './update-inventory-item.use-case';

const ITEM_ID = InventoryItemId.create('11111111-1111-4111-8111-111111111111');

function makeUseCase() {
  const items = new InMemoryInventoryItemRepository();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const useCase = new UpdateInventoryItemUseCase(items, clock, events);
  return { useCase, items, events, clock };
}

// A stored item has no pending events, like one the repository loaded.
function buildItem(sku = 'FLT-001'): InventoryItem {
  const item = InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create(sku),
    name: 'Filtro de oleo',
    description: 'Filtro padrao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  item.pullDomainEvents();
  return item;
}

describe('UpdateInventoryItemUseCase', () => {
  it('should replace only the supplied fields, leaving the others untouched', async () => {
    const { useCase, items, events, clock } = makeUseCase();
    await items.save(buildItem());

    await useCase.execute(
      new UpdateInventoryItemCommand(ITEM_ID.value, undefined, undefined, 3000),
    );

    const updated = items.items[0];
    expect(updated.unitPrice.cents).toBe(3000);
    expect(updated.name).toBe('Filtro de oleo');
    expect(updated.description).toBe('Filtro padrao');
    expect(events.published).toEqual([new InventoryItemUpdated(ITEM_ID.value, clock.now())]);
  });

  it('should refuse an unknown item and persist nothing', async () => {
    const { useCase, items } = makeUseCase();

    await expect(
      useCase.execute(new UpdateInventoryItemCommand('00000000-0000-4000-8000-000000000001', 'X')),
    ).rejects.toThrow(InventoryItemNotFoundError);
    expect(items.items).toHaveLength(0);
  });

  it('should never let update touch the SKU', async () => {
    const { useCase, items } = makeUseCase();
    await items.save(buildItem('FLT-001'));

    await useCase.execute(new UpdateInventoryItemCommand(ITEM_ID.value, 'Novo nome'));

    expect(items.items[0].sku.value).toBe('FLT-001');
  });

  it('should clear the description when explicitly given null', async () => {
    const { useCase, items } = makeUseCase();
    await items.save(buildItem());

    await useCase.execute(new UpdateInventoryItemCommand(ITEM_ID.value, undefined, null));

    expect(items.items[0].description).toBeNull();
  });
});
