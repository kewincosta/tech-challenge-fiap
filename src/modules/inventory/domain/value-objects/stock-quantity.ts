import { InsufficientStockError } from '../errors/insufficient-stock.error';
import { InvalidStockQuantityError } from '../errors/invalid-stock-quantity.error';

export class StockQuantity {
  private constructor(readonly units: number) {}

  static of(raw: number): StockQuantity {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      throw new InvalidStockQuantityError();
    }
    return new StockQuantity(raw);
  }

  plus(units: number): StockQuantity {
    return StockQuantity.of(this.units + units);
  }

  /**
   * The never-negative invariant lives here, not in a handler (design.md's Tech Decisions) -
   * rule 19 holds "at any point, through any command", so the only place that can guarantee it
   * is the value every command must go through to change the count.
   */
  minus(units: number): StockQuantity {
    if (units > this.units) {
      throw new InsufficientStockError();
    }
    return StockQuantity.of(this.units - units);
  }

  equals(other?: StockQuantity): boolean {
    return other instanceof StockQuantity && other.units === this.units;
  }
}
