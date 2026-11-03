import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { InvalidMoneyAmountError } from '../../../../../shared/domain/errors/invalid-money-amount.error';
import { InventoryItemStatus } from '../../../domain/inventory-item-status';
import { SkuAlreadyInUseError } from '../../../domain/errors/sku-already-in-use.error';
import { InventoryItemCreated } from '../../../domain/events/inventory-item-created.event';
import { CreateInventoryItemCommand } from './create-inventory-item.command';
import { CreateInventoryItemUseCase } from './create-inventory-item.use-case';

function makeUseCase() {
  const items = new InMemoryInventoryItemRepository();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const useCase = new CreateInventoryItemUseCase(items, new FakeIdGenerator(), clock, events);
  return { useCase, items, events, clock };
}

describe('CreateInventoryItemUseCase', () => {
  it('should create an active item with a quantity of zero and return its external id', async () => {
    const { useCase, items, events, clock } = makeUseCase();

    const result = await useCase.execute(
      new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', 2500, 'Filtro padrao'),
    );

    const created = items.items[0];
    expect(result.id).toBe(created.id.value);
    expect(created.status).toBe(InventoryItemStatus.Active);
    expect(created.quantityOnHand.units).toBe(0);
    expect(created.unitPrice.cents).toBe(2500);
    expect(events.published).toEqual([new InventoryItemCreated(created.id.value, clock.now())]);
  });

  it('should refuse a negative unit price through the shared kernel Money', async () => {
    // L-003: a value object's or sibling use case's passing test does not substitute for a
    // dedicated test on this specific error-producing call site.
    const { useCase, items } = makeUseCase();

    await expect(
      useCase.execute(new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', -1)),
    ).rejects.toThrow(InvalidMoneyAmountError);
    expect(items.items).toHaveLength(0);
  });

  it('should refuse a SKU an active item already holds', async () => {
    const { useCase, items } = makeUseCase();
    await useCase.execute(
      new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', 2500),
    );

    await expect(
      useCase.execute(new CreateInventoryItemCommand('FLT-001', 'Outro filtro', 'PART', 3000)),
    ).rejects.toThrow(SkuAlreadyInUseError);
    expect(items.items).toHaveLength(1);
  });

  it('should accept a creation with no description', async () => {
    const { useCase, items } = makeUseCase();

    await useCase.execute(new CreateInventoryItemCommand('OLE-005', 'Oleo 5W30', 'SUPPLY', 4500));

    expect(items.items[0].description).toBeNull();
  });
});
