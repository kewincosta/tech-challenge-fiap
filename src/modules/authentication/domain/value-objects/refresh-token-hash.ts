import { InvalidRefreshTokenHashError } from '../errors/invalid-refresh-token-hash.error';

export class RefreshTokenHash {
  private constructor(readonly value: string) {}

  static create(value: string): RefreshTokenHash {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidRefreshTokenHashError();
    }
    return new RefreshTokenHash(value);
  }

  equals(other?: RefreshTokenHash): boolean {
    return other instanceof RefreshTokenHash && other.value === this.value;
  }
}
