import { Injectable } from '@nestjs/common';
import {
  GetInventoryItemUseCase,
  GetInventoryItemQuery,
  InventoryItemNotFoundError,
} from '../../../inventory';
import { PartCatalog, PartRef } from '../../application/ports/part-catalog.port';

const ACTIVE_STATUS = 'ACTIVE';

/**
 * Reads inventory items through the public API of the inventory module. A missing item is `null`
 * whether that module answers with `null` or with its not-found error (AD-012).
 */
@Injectable()
export class PartCatalogGateway implements PartCatalog {
  constructor(private readonly getInventoryItem: GetInventoryItemUseCase) {}

  async findById(inventoryItemId: string): Promise<PartRef | null> {
    try {
      const item = await this.getInventoryItem.execute(new GetInventoryItemQuery(inventoryItemId));
      return item
        ? {
            id: item.id,
            sku: item.sku,
            name: item.name,
            unitPriceCents: item.unitPriceCents,
            active: item.status === ACTIVE_STATUS,
          }
        : null;
    } catch (error) {
      if (error instanceof InventoryItemNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
