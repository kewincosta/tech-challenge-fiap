import { InvalidWorkOrderNumberError } from '../errors/invalid-work-order-number.error';

const PATTERN = /^[A-Z0-9]{6}-[0-9]{4}$/;

export class WorkOrderNumber {
  private constructor(readonly value: string) {}

  /** Normalised to upper case, matching H17's `A1B090-2026` shape: six letters/digits, a year. */
  static create(raw: string): WorkOrderNumber {
    const normalized = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!PATTERN.test(normalized)) {
      throw new InvalidWorkOrderNumberError();
    }
    return new WorkOrderNumber(normalized);
  }

  equals(other?: WorkOrderNumber): boolean {
    return other instanceof WorkOrderNumber && other.value === this.value;
  }
}
