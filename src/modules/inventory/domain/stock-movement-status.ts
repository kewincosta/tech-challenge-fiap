/**
 * All three statuses the `stock_movements.status` CHECK constraint allows. Only a consumption
 * ever carries one - an `Inbound` or `Adjustment` movement's status is always null.
 */
export enum StockMovementStatus {
  Pending = 'PENDING',
  Settled = 'SETTLED',
  WrittenOff = 'WRITTEN_OFF',
}
