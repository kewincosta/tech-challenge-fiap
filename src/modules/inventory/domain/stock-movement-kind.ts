/**
 * All four kinds the `stock_movements.kind` CHECK constraint allows (design.md's Data Models).
 * Only `Inbound` and `Adjustment` are ever recorded by this feature - `Consumption` and `Return`
 * are written starting in phases 11-12.
 */
export enum StockMovementKind {
  Inbound = 'INBOUND',
  Consumption = 'CONSUMPTION',
  Return = 'RETURN',
  Adjustment = 'ADJUSTMENT',
}
