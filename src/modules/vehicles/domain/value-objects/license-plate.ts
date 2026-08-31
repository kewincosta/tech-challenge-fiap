import { InvalidLicensePlateError } from '../errors/invalid-license-plate.error';

const OLD_FORMAT = /^[A-Z]{3}\d{4}$/; // AAA0000
const MERCOSUL_FORMAT = /^[A-Z]{3}\d[A-Z]\d{2}$/; // AAA0A00

export class LicensePlate {
  private constructor(readonly value: string) {}

  static create(raw: string): LicensePlate {
    const normalized =
      typeof raw === 'string' ? raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
    if (!OLD_FORMAT.test(normalized) && !MERCOSUL_FORMAT.test(normalized)) {
      throw new InvalidLicensePlateError();
    }
    return new LicensePlate(normalized);
  }

  equals(other?: LicensePlate): boolean {
    return other instanceof LicensePlate && other.value === this.value;
  }
}
