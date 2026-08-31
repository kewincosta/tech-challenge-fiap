// Builds a structurally valid CPF (correct check digits) so PersonDocument.create accepts it,
// using a fresh random base each call so the partial unique index on document never collides
// across runs - the test database is never truncated. Mirrors the checksum algorithm in
// src/modules/users/domain/value-objects/person-document.ts.
export function uniqueValidCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const firstCheckDigit = computeCheckDigit(base, 10);
  const secondCheckDigit = computeCheckDigit([...base, firstCheckDigit], 11);
  return [...base, firstCheckDigit, secondCheckDigit].join('');
}

function computeCheckDigit(digits: number[], startWeight: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
