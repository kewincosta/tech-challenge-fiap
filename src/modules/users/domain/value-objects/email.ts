import { InvalidEmailError } from '../errors/invalid-email.error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 320;

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (
      normalized.length === 0 ||
      normalized.length > MAX_LENGTH ||
      !EMAIL_PATTERN.test(normalized)
    ) {
      throw new InvalidEmailError();
    }
    return new Email(normalized);
  }

  equals(other?: Email): boolean {
    return other instanceof Email && other.value === this.value;
  }
}
