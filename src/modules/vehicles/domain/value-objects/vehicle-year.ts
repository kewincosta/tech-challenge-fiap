import { InvalidVehicleYearError } from '../errors/invalid-vehicle-year.error';

const MIN_YEAR = 1950;

export class VehicleYear {
  private constructor(readonly value: number) {}

  /**
   * currentYear comes from the caller's Clock port, never read from the system clock directly -
   * see design.md's Tech Decisions. This keeps the value object testable without a fake clock of
   * its own.
   */
  static create(raw: number, currentYear: number): VehicleYear {
    if (!Number.isInteger(raw) || raw < MIN_YEAR || raw > currentYear + 1) {
      throw new InvalidVehicleYearError();
    }
    return new VehicleYear(raw);
  }

  equals(other?: VehicleYear): boolean {
    return other instanceof VehicleYear && other.value === this.value;
  }
}
