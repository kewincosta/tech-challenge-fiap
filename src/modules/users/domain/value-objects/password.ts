import { WeakPasswordError } from '../errors/weak-password.error';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export class Password {
  private constructor(readonly value: string) {}

  static create(raw: string): Password {
    if (typeof raw !== 'string' || raw.length < MIN_LENGTH || raw.length > MAX_LENGTH) {
      throw new WeakPasswordError();
    }
    const hasLetter = /[a-zA-Z]/.test(raw);
    const hasDigit = /\d/.test(raw);
    if (!hasLetter || !hasDigit) {
      throw new WeakPasswordError();
    }
    return new Password(raw);
  }
}
