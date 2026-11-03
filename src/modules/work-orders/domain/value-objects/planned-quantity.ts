import { InvalidPlannedQuantityError } from '../errors/invalid-planned-quantity.error';

/** The largest value of the `integer` column that stores a planned quantity. */
export const MAX_PLANNED_QUANTITY = 2147483647;

export class PlannedQuantity {
  private constructor(readonly units: number) {}

  /**
   * Strictly positive, unlike inventory's `StockQuantity`, which is non-negative and carries a
   * different invariant (`InsufficientStockError`), and no larger than the column that stores it.
   * Kept module-local on purpose: sharing the type would drag that invariant across a boundary
   * that has no use for it (design.md's Tech Decisions).
   */
  static create(raw: number): PlannedQuantity {
    if (
      typeof raw !== 'number' ||
      !Number.isInteger(raw) ||
      raw <= 0 ||
      raw > MAX_PLANNED_QUANTITY
    ) {
      throw new InvalidPlannedQuantityError();
    }
    return new PlannedQuantity(raw);
  }

  equals(other?: PlannedQuantity): boolean {
    return other instanceof PlannedQuantity && other.units === this.units;
  }
}
