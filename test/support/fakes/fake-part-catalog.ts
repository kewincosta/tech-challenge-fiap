import {
  PartCatalog,
  PartRef,
} from '../../../src/modules/work-orders/application/ports/part-catalog.port';

export class FakePartCatalog implements PartCatalog {
  private readonly parts = new Map<string, PartRef>();
  /** Every id the catalog was asked about, in order. */
  readonly lookups: string[] = [];

  add(part: PartRef): this {
    this.parts.set(part.id, part);
    return this;
  }

  async findById(inventoryItemId: string): Promise<PartRef | null> {
    this.lookups.push(inventoryItemId);
    return Promise.resolve(this.parts.get(inventoryItemId) ?? null);
  }
}
