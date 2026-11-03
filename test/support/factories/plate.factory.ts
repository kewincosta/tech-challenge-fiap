import { drawFree } from '../taken-values';

// A syntactically valid old-format plate (AAA0000) that no active vehicle of the never-truncated
// test database holds and no earlier call handed out - mirrors uniqueValidCpf().
export function uniqueLicensePlate(): string {
  return drawFree(drawPlate);
}

function drawPlate(): string {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${letters}${digits}`;
}
