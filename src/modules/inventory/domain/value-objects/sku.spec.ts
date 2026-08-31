import { describe, expect, it } from 'vitest';
import { InvalidSkuError } from '../errors/invalid-sku.error';
import { Sku } from './sku';

describe('Sku', () => {
  it('should accept a valid SKU and expose it trimmed and upper-cased', () => {
    expect(Sku.create('  flt-oleo-001  ').value).toBe('FLT-OLEO-001');
  });

  it('should collapse runs of internal whitespace to a single space', () => {
    expect(Sku.create('FLT   OLEO\t001').value).toBe('FLT OLEO 001');
  });

  it('should reject an empty or whitespace-only SKU', () => {
    expect(() => Sku.create('')).toThrow(InvalidSkuError);
    expect(() => Sku.create('   ')).toThrow(InvalidSkuError);
  });

  it('should reject a SKU longer than 40 characters and accept one of exactly 40', () => {
    expect(() => Sku.create('A'.repeat(41))).toThrow(InvalidSkuError);
    expect(Sku.create('A'.repeat(40)).value).toHaveLength(40);
  });

  it('should treat two SKUs differing only by case as equal', () => {
    expect(Sku.create('flt-001').equals(Sku.create('FLT-001'))).toBe(true);
  });
});
