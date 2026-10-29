import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function listIn(file: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
}

// The migration ended with nothing tolerated. A new violation fails `npm run lint` and cannot join
// a list that hides it.
describe('known violation lists', () => {
  it('holds no import violation', () => {
    expect(listIn('.dependency-cruiser-known-violations.json')).toEqual([]);
  });

  it('holds no table ownership finding', () => {
    expect(listIn('scripts/architecture/known-table-findings.json')).toEqual([]);
  });
});
