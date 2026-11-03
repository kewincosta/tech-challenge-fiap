import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vitest/config';
import { DataSource } from 'typeorm';
import { PersonDocument } from '../../src/modules/identity/users/domain/value-objects/person-document';
import { LicensePlate } from '../../src/modules/vehicles/domain/value-objects/license-plate';
import unitConfig from '../../vitest.config';
import e2eConfig from '../../vitest.e2e.config';
import integrationConfig from '../../vitest.integration.config';
import { createTestDataSource } from '../support/db';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { loadTakenValues } from '../support/load-taken-values';
import { takenValues } from '../support/taken-values';

const ROOT = resolve(__dirname, '../..');
const SETUP_TESTS = './test/support/setup-tests.ts';
const SETUP_TAKEN_VALUES = './test/support/setup-taken-values.ts';

let dataSource: DataSource;
// What the set held before the first test of this file: only the setup of the suite has run by then.
let heldAtStart: Set<string>;

beforeAll(async () => {
  heldAtStart = new Set(takenValues);
  dataSource = createTestDataSource();
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What `action` returned, and the numbers `Math.random` gave while it ran. */
function recording<T>(action: () => T): { value: T; numbers: number[] } {
  const random = vi.spyOn(Math, 'random');
  try {
    const value = action();
    return { value, numbers: random.mock.results.map((result) => result.value as number) };
  } finally {
    random.mockRestore();
  }
}

/**
 * What `action` returned while `Math.random` gave these numbers first and its usual ones after
 * them, and how many times it was called. The call is synchronous, so nothing else asks for a
 * random number between the setup of the numbers and the end of the action.
 */
function replaying<T>(numbers: number[], action: () => T): { value: T; calls: number } {
  const random = vi.spyOn(Math, 'random');
  try {
    for (const number of numbers) {
      random.mockReturnValueOnce(number);
    }
    const value = action();
    return { value, calls: random.mock.calls.length };
  } finally {
    random.mockRestore();
  }
}

// Raw inserts, as the other integration specs do, and the deletes that take back what they made.
async function insertUser(document: string): Promise<string> {
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [externalId, `${externalId}@example.com`, document],
  );
  return rows[0].id;
}

interface Owned {
  userId?: string;
  customerId?: string;
  vehicleId?: string;
}

async function insertVehicle(plate: string, owned: Owned): Promise<void> {
  owned.userId = await insertUser(uniqueValidCpf());
  const customers: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [randomUUID(), owned.userId],
  );
  owned.customerId = customers[0].id;
  const vehicles: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now())
     RETURNING id`,
    [randomUUID(), owned.customerId, plate],
  );
  owned.vehicleId = vehicles[0].id;
}

async function removeRows(owned: Owned): Promise<void> {
  if (owned.vehicleId !== undefined) {
    await dataSource.query(`DELETE FROM vehicles WHERE id = $1`, [owned.vehicleId]);
  }
  if (owned.customerId !== undefined) {
    await dataSource.query(`DELETE FROM customers WHERE id = $1`, [owned.customerId]);
  }
  if (owned.userId !== undefined) {
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [owned.userId]);
  }
}

function setupFilesOf(config: UserConfig): string[] {
  const files = config.test?.setupFiles ?? [];
  return typeof files === 'string' ? [files] : files;
}

describe('Test values', () => {
  it('skips a CPF an active user holds', async () => {
    // A CPF the factory hands out, and the numbers that drew it. The factory took it, so it is let
    // go again: only the loader may tell the factory that a user holds it.
    const { value: document, numbers } = recording(uniqueValidCpf);
    takenValues.delete(document);
    const userId = await insertUser(document);

    try {
      await loadTakenValues();
      const { value: another, calls } = replaying(numbers, uniqueValidCpf);

      expect(calls, 'the factory drew again').toBeGreaterThan(numbers.length);
      expect(another, 'the CPF of the active user').not.toBe(document);
      expect(PersonDocument.create(another).kind, 'the other document is a valid CPF').toBe('CPF');
    } finally {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('skips a plate an active vehicle holds', async () => {
    const { value: plate, numbers } = recording(uniqueLicensePlate);
    takenValues.delete(plate);
    const owned: Owned = {};

    try {
      await insertVehicle(plate, owned);
      await loadTakenValues();
      const { value: another, calls } = replaying(numbers, uniqueLicensePlate);

      expect(calls, 'the factory drew again').toBeGreaterThan(numbers.length);
      expect(another, 'the plate of the active vehicle').not.toBe(plate);
      expect(another, 'the other plate has the same format').toMatch(/^[A-Z]{3}\d{4}$/);
      expect(() => LicensePlate.create(another), 'the other plate is valid').not.toThrow();
    } finally {
      await removeRows(owned);
    }
  });

  it('never hands out the same CPF or plate twice', () => {
    const factories: Array<[string, () => string, (value: string) => unknown]> = [
      ['CPF', uniqueValidCpf, (value) => PersonDocument.create(value)],
      ['plate', uniqueLicensePlate, (value) => LicensePlate.create(value)],
    ];

    for (const [name, factory, validate] of factories) {
      const first = recording(factory);
      // The second call draws the very numbers that gave the first value.
      const second = replaying(first.numbers, factory);

      expect(second.calls, `the second ${name} was drawn again`).toBeGreaterThan(
        first.numbers.length,
      );
      expect(second.value, `the second ${name} differs from the first`).not.toBe(first.value);
      expect(() => validate(second.value), `the second ${name} is valid`).not.toThrow();
    }
  });

  it('loads the taken values in the integration and e2e suites only', async () => {
    // The integration and e2e suites run the setup that loads them after the one that reads
    // .env.test, which the loader needs for the database settings. The unit suite runs the second
    // alone, and nothing it runs names the values.
    expect(setupFilesOf(integrationConfig)).toEqual([SETUP_TESTS, SETUP_TAKEN_VALUES]);
    expect(setupFilesOf(e2eConfig)).toEqual([SETUP_TESTS, SETUP_TAKEN_VALUES]);
    expect(setupFilesOf(unitConfig)).toEqual([SETUP_TESTS]);
    for (const file of setupFilesOf(unitConfig)) {
      expect(readFileSync(resolve(ROOT, file), 'utf8'), `${file} loads nothing`).not.toMatch(
        /taken-values/,
      );
    }

    // This file runs under the integration configuration. Every active user and vehicle the
    // database holds was in the set before the first test of the file.
    const users: Array<{ document: string }> = await dataSource.query(
      `SELECT document FROM users WHERE deleted_at IS NULL`,
    );
    const vehicles: Array<{ plate: string }> = await dataSource.query(
      `SELECT plate FROM vehicles WHERE deleted_at IS NULL`,
    );
    const held = [...users.map((row) => row.document), ...vehicles.map((row) => row.plate)];

    expect(
      held.filter((value) => !heldAtStart.has(value)).slice(0, 5),
      'values of active rows that the setup did not load',
    ).toEqual([]);
  });
});
