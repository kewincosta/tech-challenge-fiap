import { drawFree } from '../taken-values';

// Builds a structurally valid CPF (correct check digits) so PersonDocument.create accepts it,
// from a random base. A CPF that an active user of the test database holds, or that an earlier call
// handed out, is drawn again: the test database is never truncated, so the partial unique index on
// document would refuse it (see taken-values.ts). Mirrors the checksum algorithm in
// src/modules/identity/users/domain/value-objects/person-document.ts.
export function uniqueValidCpf(): string {
  return drawFree(drawCpf);
}

function drawCpf(): string {
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
