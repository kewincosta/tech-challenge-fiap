/** What work orders read of an inventory item: the SKU, name and price a work order snapshots. */
export interface PartRef {
  id: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  active: boolean;
}

export interface PartCatalog {
  /** A deactivated item is still found, with `active` false. `null` when there is none. */
  findById(inventoryItemId: string): Promise<PartRef | null>;
}
