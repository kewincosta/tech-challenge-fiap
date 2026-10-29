import { describe, expect, it } from 'vitest';
import {
  GetInventoryItemHandler,
  GetInventoryItemQuery,
  InventoryItemNotFoundError,
  InventoryItemSummaryDto,
} from '../../../inventory';
import { PartCatalogGateway } from './part-catalog.gateway';

const ITEM_ID = '55555555-5555-4555-8555-555555555555';

const ACTIVE_ITEM: InventoryItemSummaryDto = {
  id: ITEM_ID,
  sku: 'FLT-001',
  name: 'Filtro de oleo',
  description: null,
  kind: 'PART',
  unitPriceCents: 2500,
  quantityOnHand: 10,
  status: 'ACTIVE',
};

// The gateway uses only `execute` of the inventory module's handler. The stand-in answers for the
// one id it is asked about, so a gateway that sends the wrong identifier gets `null`.
function gatewayOver(result: InventoryItemSummaryDto | null | Error): PartCatalogGateway {
  const getInventoryItem = {
    execute: (query: GetInventoryItemQuery) => {
      if (query.itemId !== ITEM_ID) {
        return Promise.resolve(null);
      }
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  } as unknown as GetInventoryItemHandler;
  return new PartCatalogGateway(getInventoryItem);
}

describe('PartCatalogGateway', () => {
  it('should map the inventory module answer to the id, the SKU, the name, the unit price and an active flag', async () => {
    const catalog = gatewayOver(ACTIVE_ITEM);

    const part = await catalog.findById(ITEM_ID);

    expect(part).toEqual({
      id: ITEM_ID,
      sku: 'FLT-001',
      name: 'Filtro de oleo',
      unitPriceCents: 2500,
      active: true,
    });
  });

  it('should report a deactivated item as found and not active', async () => {
    const catalog = gatewayOver({ ...ACTIVE_ITEM, status: 'INACTIVE' });

    const part = await catalog.findById(ITEM_ID);

    expect(part).toEqual({
      id: ITEM_ID,
      sku: 'FLT-001',
      name: 'Filtro de oleo',
      unitPriceCents: 2500,
      active: false,
    });
  });

  it('should answer null when the inventory module answers null', async () => {
    const catalog = gatewayOver(null);

    expect(await catalog.findById(ITEM_ID)).toBeNull();
  });

  it('should answer null when the inventory module throws its not-found error', async () => {
    const catalog = gatewayOver(new InventoryItemNotFoundError());

    expect(await catalog.findById(ITEM_ID)).toBeNull();
  });

  it('should let any other error from the inventory module through', async () => {
    const failure = new Error('database is down');
    const catalog = gatewayOver(failure);

    await expect(catalog.findById(ITEM_ID)).rejects.toBe(failure);
  });
});
