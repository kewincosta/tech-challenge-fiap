import { InvalidPlannedQuantityError } from '../errors/invalid-planned-quantity.error';

export class PlannedQuantity {
  private constructor(readonly units: number) {}

  /**
   * Strictly positive, unlike inventory's `StockQuantity`, which is non-negative and carries a
   * different invariant (`InsufficientStockError`). Kept module-local on purpose: sharing the
   * type would drag that invariant across a boundary that has no use for it (design.md's Tech
   * Decisions).
   */
  static create(raw: number): PlannedQuantity {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
      throw new InvalidPlannedQuantityError();
    }
    return new PlannedQuantity(raw);
  }

  equals(other?: PlannedQuantity): boolean {
    return other instanceof PlannedQuantity && other.units === this.units;
  }
}
