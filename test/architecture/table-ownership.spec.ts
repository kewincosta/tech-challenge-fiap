import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkTableOwnership,
  scanTableOwnership,
  type Finding,
} from '../../scripts/architecture/check-table-ownership';

const ROOT = resolve(__dirname, '../..');
const FIXTURES = resolve(__dirname, 'fixtures/table-ownership');

function summarize(findings: Finding[]): string[] {
  return findings.map((finding) => `${finding.kind}: ${finding.file} -> ${finding.table}`);
}

describe('table ownership check', () => {
  it('reports a table another module owns after FROM, JOIN, INTO and UPDATE, in the adapter that queries it', () => {
    expect(summarize(scanTableOwnership(resolve(FIXTURES, 'foreign')))).toEqual([
      'foreign-table: src/modules/customers/infrastructure/persistence/foreign-read.ts -> users',
      'foreign-table: src/modules/vehicles/infrastructure/persistence/foreign-tables.ts -> customers',
      'foreign-table: src/modules/vehicles/infrastructure/persistence/foreign-tables.ts -> inventory_items',
      'foreign-table: src/modules/vehicles/infrastructure/persistence/foreign-tables.ts -> services',
      'foreign-table: src/modules/vehicles/infrastructure/persistence/foreign-tables.ts -> users',
    ]);
  });

  it('reports a table the owner map does not list', () => {
    expect(summarize(scanTableOwnership(resolve(FIXTURES, 'unknown')))).toEqual([
      'unknown-table: src/modules/services/infrastructure/persistence/unknown-table.ts -> mystery_rows',
    ]);
  });

  it('reports a table name built at runtime, in a template literal or by concatenation', () => {
    expect(summarize(scanTableOwnership(resolve(FIXTURES, 'runtime')))).toEqual([
      'runtime-table: src/modules/work-orders/infrastructure/persistence/concatenated-table.ts -> <concatenated>',
      'runtime-table: src/modules/work-orders/infrastructure/persistence/template-table.ts -> ${table}',
    ]);
  });

  it('reports a table a migration creates that the owner map lacks', () => {
    expect(summarize(scanTableOwnership(resolve(FIXTURES, 'migration')))).toEqual([
      'unmapped-migration-table: src/shared/infrastructure/database/migrations/1-create-tables.ts -> orphan_rows',
    ]);
  });

  it('reports nothing for a module that queries its own tables, whatever else its SQL and comments hold', () => {
    expect(scanTableOwnership(resolve(FIXTURES, 'clean'))).toEqual([]);
  });

  it('fails the check, naming the adapter and the table, for a finding that is not known', () => {
    const root = resolve(FIXTURES, 'foreign');
    const knownFindings = scanTableOwnership(root).slice(0, 4);

    const { exitCode, report } = checkTableOwnership(root, knownFindings);

    expect(exitCode).toBe(1);
    expect(report).toEqual([
      'src/modules/vehicles/infrastructure/persistence/foreign-tables.ts: queries users, a table owned by identity',
      '1 table ownership violation(s) found (4 known findings ignored).',
    ]);
  });

  it('passes the check when every finding is known', () => {
    const root = resolve(FIXTURES, 'foreign');

    const { exitCode, report } = checkTableOwnership(root, scanTableOwnership(root));

    expect(exitCode).toBe(0);
    expect(report).toEqual(['No table ownership violations found (5 known findings ignored).']);
  });

  it('passes on the source tree apart from its known findings', () => {
    const known = JSON.parse(
      readFileSync(resolve(ROOT, 'scripts/architecture/known-table-findings.json'), 'utf8'),
    ) as Finding[];

    expect(checkTableOwnership(ROOT, known).exitCode).toBe(0);
  });
});
