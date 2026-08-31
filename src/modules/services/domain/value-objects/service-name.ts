import { InvalidServiceNameError } from '../errors/invalid-service-name.error';

const MAX_LENGTH = 120;

export class ServiceName {
  private constructor(readonly value: string) {}

  /**
   * Stores the name as the administrator capitalised it. Uniqueness is compared case-insensitively,
   * but that comparison lives in the partial unique index on lower(name) and in the repository's
   * lookup - not here - so the catalog still displays what was typed (design.md's Tech Decisions).
   */
  static create(raw: string): ServiceName {
    const normalized = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (normalized.length === 0 || normalized.length > MAX_LENGTH) {
      throw new InvalidServiceNameError();
    }
    return new ServiceName(normalized);
  }

  equals(other?: ServiceName): boolean {
    return other instanceof ServiceName && other.value === this.value;
  }
}
