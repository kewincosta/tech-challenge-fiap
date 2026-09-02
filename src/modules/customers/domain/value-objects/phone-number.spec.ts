import { describe, expect, it } from 'vitest';
import { InvalidPhoneNumberError } from '../errors/invalid-phone-number.error';
import { PhoneNumber } from './phone-number';

describe('PhoneNumber', () => {
  it('should accept a mobile number with nine digits after the area code', () => {
    const phone = PhoneNumber.create('11987654321');

    expect(phone?.value).toBe('11987654321');
  });

  it('should accept a landline number with eight digits after the area code', () => {
    const phone = PhoneNumber.create('1133334444');

    expect(phone?.value).toBe('1133334444');
  });

  it('should reject a number without an area code', () => {
    expect(() => PhoneNumber.create('987654321')).toThrow(InvalidPhoneNumberError);
    expect(() => PhoneNumber.create('33334444')).toThrow(InvalidPhoneNumberError);
  });

  it('should normalise a formatted number to digits', () => {
    const phone = PhoneNumber.create('(11) 98765-4321');

    expect(phone?.value).toBe('11987654321');
  });

  it('should accept an absent phone number', () => {
    expect(PhoneNumber.create(undefined)).toBeUndefined();
  });

  it('should treat two phone numbers with the same digits as equal', () => {
    const first = PhoneNumber.create('11987654321');
    const second = PhoneNumber.create('(11) 98765-4321');

    expect(first?.equals(second)).toBe(true);
  });

  it('should never equal a different number or something that is not a PhoneNumber', () => {
    const phone = PhoneNumber.create('11987654321');
    const other = PhoneNumber.create('1133334444');

    expect(phone?.equals(other)).toBe(false);
    expect(phone?.equals(undefined)).toBe(false);
  });
});
