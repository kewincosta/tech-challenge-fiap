import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { InvalidMoneyAmountError } from '../../../../../shared/domain/errors/invalid-money-amount.error';
import { InventoryItemStatus } from '../../../domain/inventory-item-status';
import { SkuAlreadyInUseError } from '../../../domain/errors/sku-already-in-use.error';
import { CreateInventoryItemCommand } from './create-inventory-item.command';
import { CreateInventoryItemHandler } from './create-inventory-item.handler';

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const handler = new CreateInventoryItemHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    stubEventBus().bus,
  );
  return { handler, items };
}

describe('CreateInventoryItemHandler', () => {
  it('should create an active item with a quantity of zero and return its external id', async () => {
    const { handler, items } = makeHandler();

    const result = await handler.execute(
      new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', 2500, 'Filtro padrao'),
    );

    const created = items.items[0];
    expect(result.id).toBe(created.id.value);
    expect(created.status).toBe(InventoryItemStatus.Active);
    expect(created.quantityOnHand.units).toBe(0);
    expect(created.unitPrice.cents).toBe(2500);
  });

  it('should refuse a negative unit price through the shared kernel Money', async () => {
    // L-003: a value object's or sibling handler's passing test does not substitute for a
    // dedicated test on this specific error-producing call site.
    const { handler, items } = makeHandler();

    await expect(
      handler.execute(new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', -1)),
    ).rejects.toThrow(InvalidMoneyAmountError);
    expect(items.items).toHaveLength(0);
  });

  it('should refuse a SKU an active item already holds', async () => {
    const { handler, items } = makeHandler();
    await handler.execute(
      new CreateInventoryItemCommand('FLT-001', 'Filtro de oleo', 'PART', 2500),
    );

    await expect(
      handler.execute(new CreateInventoryItemCommand('FLT-001', 'Outro filtro', 'PART', 3000)),
    ).rejects.toThrow(SkuAlreadyInUseError);
    expect(items.items).toHaveLength(1);
  });

  it('should accept a creation with no description', async () => {
    const { handler, items } = makeHandler();

    await handler.execute(new CreateInventoryItemCommand('OLE-005', 'Oleo 5W30', 'SUPPLY', 4500));

    expect(items.items[0].description).toBeNull();
  });
});
