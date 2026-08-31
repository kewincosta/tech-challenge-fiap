/**
 * Every item this feature creates is `Active` - no command here sets `Inactive` (spec.md's
 * Out of Scope). The column and this enum are built now because the schema is deliberately
 * ahead of the commands.
 */
export enum InventoryItemStatus {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
}
