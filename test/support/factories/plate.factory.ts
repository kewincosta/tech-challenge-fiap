// A syntactically valid old-format plate (AAA0000), unique enough per call that two test runs
// against the same never-truncated test database do not collide - mirrors uniqueValidCpf().
export function uniqueLicensePlate(): string {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${letters}${digits}`;
}
