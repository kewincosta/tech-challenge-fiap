export class CreateInventoryItemCommand {
  constructor(
    readonly sku: string,
    readonly name: string,
    /** `PART` or `SUPPLY` - validated at the request DTO layer (design.md's Error Handling). */
    readonly kind: string,
    readonly unitPriceCents: number,
    readonly description?: string | null,
  ) {}
}

export interface CreatedInventoryItemDto {
  id: string;
}
