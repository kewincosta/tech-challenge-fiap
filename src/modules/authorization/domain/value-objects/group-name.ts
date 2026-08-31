import { InvalidGroupNameError } from '../errors/invalid-group-name.error';

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

export class GroupName {
  private constructor(readonly value: string) {}

  static create(raw: string): GroupName {
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      throw new InvalidGroupNameError();
    }
    return new GroupName(normalized);
  }

  equals(other?: GroupName): boolean {
    return other instanceof GroupName && other.value === this.value;
  }
}
