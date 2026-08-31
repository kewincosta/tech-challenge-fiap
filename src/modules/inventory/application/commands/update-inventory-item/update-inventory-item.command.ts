export class UpdateInventoryItemCommand {
  constructor(
    readonly itemId: string,
    readonly name?: string,
    /** `null` clears the description; omitting the field leaves it untouched. */
    readonly description?: string | null,
    readonly unitPriceCents?: number,
  ) {}
}
