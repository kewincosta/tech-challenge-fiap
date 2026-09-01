import { describe, expect, it, vi } from 'vitest';
import { InventoryQueryPort, StockShortageDto } from '../../ports/inventory-query.port';
import { ListStockShortagesHandler } from './list-stock-shortages.handler';
import { ListStockShortagesQuery } from './list-stock-shortages.query';

function fakePort(result: StockShortageDto[]): InventoryQueryPort {
  return {
    getById: vi.fn(),
    listActive: vi.fn(),
    listMovements: vi.fn(),
    listStockShortages: vi.fn().mockResolvedValue(result),
  };
}

describe('ListStockShortagesHandler', () => {
  it('returns what the port answers, unchanged', async () => {
    const shortages: StockShortageDto[] = [
      {
        inventoryItemId: '11111111-1111-4111-8111-111111111111',
        sku: 'FLT-001',
        name: 'Filtro de oleo',
        quantityOnHand: 1,
        outstandingQuantity: 4,
        workOrderNumbers: ['A1B090-2026'],
      },
    ];
    const inventoryQuery = fakePort(shortages);
    const handler = new ListStockShortagesHandler(inventoryQuery);

    const result = await handler.execute(new ListStockShortagesQuery());

    expect(result).toEqual(shortages);
  });

  it('returns an empty list when nothing is short, never an error', async () => {
    const inventoryQuery = fakePort([]);
    const handler = new ListStockShortagesHandler(inventoryQuery);

    const result = await handler.execute(new ListStockShortagesQuery());

    expect(result).toEqual([]);
  });

  it('calls the port exactly once, with no arguments of its own', async () => {
    const inventoryQuery = fakePort([]);
    const handler = new ListStockShortagesHandler(inventoryQuery);

    await handler.execute(new ListStockShortagesQuery());

    expect(inventoryQuery.listStockShortages).toHaveBeenCalledTimes(1);
    expect(inventoryQuery.listStockShortages).toHaveBeenCalledWith();
  });
});
