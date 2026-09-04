import { InvalidAddressError } from '../errors/invalid-address.error';

// The 26 states plus the Federal District - the fixed, stable set of real Brazilian UF codes.
// "should reject an invalid state code" implies a real
// membership check, not a two-letter shape check.
const VALID_UF_CODES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export interface AddressInput {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export class Address {
  private constructor(
    readonly street: string,
    readonly number: string,
    readonly complement: string | null,
    readonly district: string,
    readonly city: string,
    readonly state: string,
    readonly zipCode: string,
  ) {}

  /**
   * All-or-nothing: an absent input means no address at all, and every field but `complement`
   * is required once any address is supplied (CVR-01 AC7/AC9).
   */
  static create(input: AddressInput | undefined): Address | undefined {
    if (input === undefined) {
      return undefined;
    }
    const street = typeof input.street === 'string' ? input.street.trim() : '';
    const number = typeof input.number === 'string' ? input.number.trim() : '';
    const district = typeof input.district === 'string' ? input.district.trim() : '';
    const city = typeof input.city === 'string' ? input.city.trim() : '';
    const state = typeof input.state === 'string' ? input.state.trim().toUpperCase() : '';
    const zipCode = typeof input.zipCode === 'string' ? input.zipCode.replace(/\D/g, '') : '';
    const complement =
      typeof input.complement === 'string' && input.complement.trim().length > 0
        ? input.complement.trim()
        : null;

    if (!street || !number || !district || !city || zipCode.length !== 8) {
      throw new InvalidAddressError();
    }
    if (!VALID_UF_CODES.has(state)) {
      throw new InvalidAddressError();
    }

    return new Address(street, number, complement, district, city, state, zipCode);
  }

  equals(other?: Address): boolean {
    return (
      other instanceof Address &&
      other.street === this.street &&
      other.number === this.number &&
      other.complement === this.complement &&
      other.district === this.district &&
      other.city === this.city &&
      other.state === this.state &&
      other.zipCode === this.zipCode
    );
  }
}
