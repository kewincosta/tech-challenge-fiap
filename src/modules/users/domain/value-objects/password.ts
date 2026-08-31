import { WeakPasswordError } from '../errors/weak-password.error';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const GENERATED_LENGTH = 12;
// Excludes visually ambiguous characters (0/O, 1/I/l) - this password is read off a screen and
// handed to someone at the counter, not typed from a password manager.
const GENERATED_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const GENERATED_DIGITS = '23456789';

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

  /**
   * A temporary password for a staff-created account. Builds the candidate from the domain's own
   * alphabet, with at least one letter and one digit guaranteed by construction, then runs it
   * through create() so it can never drift out of sync with the strength rule above.
   */
  static generate(): Password {
    const alphabet = GENERATED_LETTERS + GENERATED_DIGITS;
    const chars = [
      GENERATED_LETTERS[Math.floor(Math.random() * GENERATED_LETTERS.length)],
      GENERATED_DIGITS[Math.floor(Math.random() * GENERATED_DIGITS.length)],
    ];
    while (chars.length < GENERATED_LENGTH) {
      chars.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
    }
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return Password.create(chars.join(''));
  }
}
