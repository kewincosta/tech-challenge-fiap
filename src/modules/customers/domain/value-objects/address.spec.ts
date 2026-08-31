import { describe, expect, it } from 'vitest';
import { InvalidAddressError } from '../errors/invalid-address.error';
import { Address } from './address';

const COMPLETE_ADDRESS = {
  street: 'Rua das Flores',
  number: '123',
  district: 'Centro',
  city: 'São Paulo',
  state: 'sp',
  zipCode: '01001-000',
};

describe('Address', () => {
  it('should accept a complete address', () => {
    const address = Address.create(COMPLETE_ADDRESS);

    expect(address).toBeDefined();
    expect(address?.state).toBe('SP');
    expect(address?.zipCode).toBe('01001000');
    expect(address?.complement).toBeNull();
  });

  it('should accept an empty address', () => {
    expect(Address.create(undefined)).toBeUndefined();
  });

  it('should reject a partially populated address', () => {
    const { zipCode: _zipCode, ...withoutZip } = COMPLETE_ADDRESS;

    expect(() => Address.create(withoutZip as never)).toThrow(InvalidAddressError);
  });

  it('should reject an invalid state code', () => {
    expect(() => Address.create({ ...COMPLETE_ADDRESS, state: 'ZZ' })).toThrow(
      InvalidAddressError,
    );
  });

  it('should reject a malformed zip code', () => {
    expect(() => Address.create({ ...COMPLETE_ADDRESS, zipCode: '123' })).toThrow(
      InvalidAddressError,
    );
  });

  it('should normalise the zip code to digits', () => {
    const address = Address.create({ ...COMPLETE_ADDRESS, zipCode: '01001-000' });

    expect(address?.zipCode).toBe('01001000');
  });
});
