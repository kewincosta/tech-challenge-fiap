import { InvalidSkuError } from '../errors/invalid-sku.error';

const MAX_LENGTH = 40;

export class Sku {
  private constructor(readonly value: string) {}

  /**
   * Normalised to upper case on the way in. A SKU is a code, not a display name, so nothing about
   * its casing is worth preserving - and normalising here is what lets the unique index stay a
   * plain index on `sku` instead of an expression index (design.md's Tech Decisions).
   */
  static create(raw: string): Sku {
    const normalized = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').toUpperCase() : '';
    if (normalized.length === 0 || normalized.length > MAX_LENGTH) {
      throw new InvalidSkuError();
    }
    return new Sku(normalized);
  }

  equals(other?: Sku): boolean {
    return other instanceof Sku && other.value === this.value;
  }
}
