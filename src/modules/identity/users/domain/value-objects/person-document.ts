import { InvalidPersonDocumentError } from '../errors/invalid-person-document.error';

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const CNPJ_FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export type PersonDocumentKind = 'CPF' | 'CNPJ';

export class PersonDocument {
  private constructor(
    private readonly digits: string,
    private readonly documentKind: PersonDocumentKind,
  ) {}

  static create(raw: string): PersonDocument {
    const digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';

    if (digits.length === CPF_LENGTH && isValidCpf(digits)) {
      return new PersonDocument(digits, 'CPF');
    }

    if (digits.length === CNPJ_LENGTH && isValidCnpj(digits)) {
      return new PersonDocument(digits, 'CNPJ');
    }

    throw new InvalidPersonDocumentError();
  }

  get value(): string {
    return this.digits;
  }

  get kind(): PersonDocumentKind {
    return this.documentKind;
  }

  equals(other?: PersonDocument): boolean {
    return other instanceof PersonDocument && other.digits === this.digits;
  }
}

function hasRepeatedDigits(digits: string): boolean {
  return digits.split('').every((digit) => digit === digits[0]);
}

function isValidCpf(digits: string): boolean {
  if (hasRepeatedDigits(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);
  const firstCheckDigit = computeDescendingCheckDigit(numbers.slice(0, 9), 10);
  if (firstCheckDigit !== numbers[9]) {
    return false;
  }

  const secondCheckDigit = computeDescendingCheckDigit(numbers.slice(0, 10), 11);
  return secondCheckDigit === numbers[10];
}

function isValidCnpj(digits: string): boolean {
  if (hasRepeatedDigits(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);
  const firstCheckDigit = computeWeightedCheckDigit(numbers.slice(0, 12), CNPJ_FIRST_WEIGHTS);
  if (firstCheckDigit !== numbers[12]) {
    return false;
  }

  const secondCheckDigit = computeWeightedCheckDigit(numbers.slice(0, 13), CNPJ_SECOND_WEIGHTS);
  return secondCheckDigit === numbers[13];
}

function computeDescendingCheckDigit(numbers: number[], startWeight: number): number {
  const weights = numbers.map((_, index) => startWeight - index);
  return computeWeightedCheckDigit(numbers, weights);
}

function computeWeightedCheckDigit(numbers: number[], weights: number[]): number {
  const sum = numbers.reduce((total, digit, index) => total + digit * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
