import { describe, expect, it } from 'vitest';
import { InvalidVehicleYearError } from '../errors/invalid-vehicle-year.error';
import { VehicleYear } from './vehicle-year';

const CURRENT_YEAR = 2026;

describe('VehicleYear', () => {
  it('should accept a plausible year', () => {
    expect(VehicleYear.create(2020, CURRENT_YEAR).value).toBe(2020);
  });

  it('should reject a year before 1950', () => {
    expect(() => VehicleYear.create(1949, CURRENT_YEAR)).toThrow(InvalidVehicleYearError);
  });

  it('should reject a year more than one year ahead of the current year', () => {
    expect(() => VehicleYear.create(CURRENT_YEAR + 2, CURRENT_YEAR)).toThrow(
      InvalidVehicleYearError,
    );
  });

  it('should accept exactly one year ahead of the current year', () => {
    expect(VehicleYear.create(CURRENT_YEAR + 1, CURRENT_YEAR).value).toBe(CURRENT_YEAR + 1);
  });
});
