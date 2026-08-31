import { InvalidIdError } from './errors/invalid-id.error';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class EntityId {
  protected constructor(readonly value: string) {}

  protected static validate(value: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new InvalidIdError(value);
    }
    return value.toLowerCase();
  }

  equals(other?: EntityId): boolean {
    return other instanceof this.constructor && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
