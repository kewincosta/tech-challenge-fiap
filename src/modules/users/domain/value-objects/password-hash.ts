import { InvalidPasswordHashError } from '../errors/invalid-password-hash.error';

export class PasswordHash {
  private constructor(readonly value: string) {}

  static create(value: string): PasswordHash {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidPasswordHashError();
    }
    return new PasswordHash(value);
  }
}
