import { describe, expect, it } from 'vitest';
import { InvalidLicensePlateError } from '../errors/invalid-license-plate.error';
import { LicensePlate } from './license-plate';

describe('LicensePlate', () => {
  it('should accept the old format AAA0000', () => {
    expect(LicensePlate.create('ABC1234').value).toBe('ABC1234');
  });

  it('should accept the Mercosul format AAA0A00', () => {
    expect(LicensePlate.create('ABC1D23').value).toBe('ABC1D23');
  });

  it('should normalise lower case and separators', () => {
    expect(LicensePlate.create('abc-1234').value).toBe('ABC1234');
  });

  it('should reject a plate matching neither format', () => {
    expect(() => LicensePlate.create('ABCD123')).toThrow(InvalidLicensePlateError);
    expect(() => LicensePlate.create('AB123')).toThrow(InvalidLicensePlateError);
  });
});
