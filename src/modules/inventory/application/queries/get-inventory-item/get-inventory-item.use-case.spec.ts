import { describe, expect, it, vi } from 'vitest';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemSummaryDto, InventoryQueryPort } from '../../ports/inventory-query.port';
import { GetInventoryItemUseCase } from './get-inventory-item.use-case';
import { GetInventoryItemQuery } from './get-inventory-item.query';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

function item(overrides: Partial<InventoryItemSummaryDto> = {}): InventoryItemSummaryDto {
  return {
    id: ITEM_ID,
    sku: 'FLT-001',
    name: 'Filtro de oleo',
    description: 'Filtro padrao',
    kind: 'PART',
    unitPriceCents: 2500,
    quantityOnHand: 10,
    status: 'ACTIVE',
    ...overrides,
  };
}

// Like the real adapter, the port answers only for the item it holds.
function portHolding(held: InventoryItemSummaryDto | null): InventoryQueryPort {
  return {
    getById: vi.fn((id: string) => Promise.resolve(held?.id === id ? held : null)),
    listActive: vi.fn(),
    listMovements: vi.fn(),
    listStockShortages: vi.fn(),
    listOpenWorkOrderNumbersUsing: vi.fn(),
  };
}

describe('GetInventoryItemUseCase', () => {
  it('returns the item the port holds for a well formed id', async () => {
    const useCase = new GetInventoryItemUseCase(portHolding(item()));

    const result = await useCase.execute(new GetInventoryItemQuery(ITEM_ID));

    expect(result).toEqual(item());
  });

  it('returns a deactivated item with its status, so "deactivated" stays apart from "does not exist"', async () => {
    const useCase = new GetInventoryItemUseCase(portHolding(item({ status: 'INACTIVE' })));

    const result = await useCase.execute(new GetInventoryItemQuery(ITEM_ID));

    expect(result).toMatchObject({ status: 'INACTIVE' });
  });

  it('refuses an id the port holds nothing for with the inventory item not-found error', async () => {
    const useCase = new GetInventoryItemUseCase(portHolding(null));

    await expect(useCase.execute(new GetInventoryItemQuery(ITEM_ID))).rejects.toThrow(
      InventoryItemNotFoundError,
    );
  });

  it('refuses a malformed id with the inventory item not-found error, even when the port would answer it', async () => {
    const useCase = new GetInventoryItemUseCase(portHolding(item({ id: 'not-a-uuid' })));

    await expect(useCase.execute(new GetInventoryItemQuery('not-a-uuid'))).rejects.toThrow(
      InventoryItemNotFoundError,
    );
  });
});
