import { InvalidPhoneNumberError } from '../errors/invalid-phone-number.error';

const LANDLINE_LENGTH = 10; // 2-digit area code + 8 digits
const MOBILE_LENGTH = 11; // 2-digit area code + 9 digits

export class PhoneNumber {
  private constructor(readonly value: string) {}

  /** An absent input means no phone number at all (CVR-01 AC9). */
  static create(raw: string | undefined): PhoneNumber | undefined {
    if (raw === undefined) {
      return undefined;
    }
    const digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
    if (digits.length !== LANDLINE_LENGTH && digits.length !== MOBILE_LENGTH) {
      throw new InvalidPhoneNumberError();
    }
    return new PhoneNumber(digits);
  }

  equals(other?: PhoneNumber): boolean {
    return other instanceof PhoneNumber && other.value === this.value;
  }
}
