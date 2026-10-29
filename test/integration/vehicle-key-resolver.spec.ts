import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource, EntityManager } from 'typeorm';
import { VehicleKeyResolver } from '../../src/modules/vehicles';
import {
  currentEntityManager,
  TypeOrmTransactionRunner,
} from '../../src/shared/infrastructure/database/typeorm-transaction-runner';
import { uniqueValidCpf } from '../support/factories/document.factory';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { createTestDataSource } from '../support/db';

// The largest bigint: no sequence in the test database gets there, so no vehicle owns it.
const UNKNOWN_INTERNAL_ID = '9223372036854775807';

let dataSource: DataSource;
let resolver: VehicleKeyResolver;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  resolver = new VehicleKeyResolver(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

interface VehicleKeys {
  id: string;
  externalId: string;
}

async function insertCustomer(runner: DataSource | EntityManager): Promise<string> {
  const userExternalId = randomUUID();
  const users: Array<{ id: string }> = await runner.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hash', 'Test User', $3, 'ACTIVE', now(), now())
     RETURNING id`,
    [userExternalId, `${userExternalId}@example.com`, uniqueValidCpf()],
  );
  const customers: Array<{ id: string }> = await runner.query(
    `INSERT INTO customers (external_id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'ACTIVE', now(), now())
     RETURNING id`,
    [randomUUID(), users[0].id],
  );
  return customers[0].id;
}

// A raw insert returns the internal key from the database itself, so no expected value depends on
// the resolver under test. Each vehicle gets a customer of its own, and a removed vehicle is one
// with a deletion time.
async function insertVehicle(
  runner: DataSource | EntityManager,
  { removed = false } = {},
): Promise<VehicleKeys> {
  const customerId = await insertCustomer(runner);
  const externalId = randomUUID();
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO vehicles (external_id, customer_id, plate, brand, model, year, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, 'Toyota', 'Corolla', 2020, now(), now(), $4)
     RETURNING id`,
    [externalId, customerId, uniqueLicensePlate(), removed ? new Date() : null],
  );
  return { id: rows[0].id, externalId };
}

describe('VehicleKeyResolver', () => {
  it('translates a vehicle external id into its internal key', async () => {
    const vehicle = await insertVehicle(dataSource);

    expect(await resolver.toInternalId(vehicle.externalId)).toBe(vehicle.id);
  });

  it('translates an internal key into the vehicle external id', async () => {
    const vehicle = await insertVehicle(dataSource);

    expect(await resolver.toExternalId(vehicle.id)).toBe(vehicle.externalId);
  });

  it('answers null for a key that belongs to no vehicle, in both directions', async () => {
    expect(await resolver.toInternalId(randomUUID())).toBeNull();
    expect(await resolver.toExternalId(UNKNOWN_INTERNAL_ID)).toBeNull();
  });

  it('translates a batch of external ids and leaves the unknown ones out', async () => {
    const first = await insertVehicle(dataSource);
    const second = await insertVehicle(dataSource);

    const internalIds = await resolver.toInternalIds([
      first.externalId,
      randomUUID(),
      second.externalId,
      first.externalId,
    ]);

    expect(internalIds).toEqual(
      new Map([
        [first.externalId, first.id],
        [second.externalId, second.id],
      ]),
    );
  });

  it('translates a batch of internal keys and leaves the unknown ones out', async () => {
    const first = await insertVehicle(dataSource);
    const second = await insertVehicle(dataSource);

    const externalIds = await resolver.toExternalIds([
      first.id,
      UNKNOWN_INTERNAL_ID,
      second.id,
      first.id,
    ]);

    expect(externalIds).toEqual(
      new Map([
        [first.id, first.externalId],
        [second.id, second.externalId],
      ]),
    );
  });

  it('resolves a removed vehicle in every form', async () => {
    const vehicle = await insertVehicle(dataSource, { removed: true });

    expect(await resolver.toInternalId(vehicle.externalId)).toBe(vehicle.id);
    expect(await resolver.toExternalId(vehicle.id)).toBe(vehicle.externalId);
    expect(await resolver.toInternalIds([vehicle.externalId])).toEqual(
      new Map([[vehicle.externalId, vehicle.id]]),
    );
    expect(await resolver.toExternalIds([vehicle.id])).toEqual(
      new Map([[vehicle.id, vehicle.externalId]]),
    );
  });

  // The fixture is written and read inside one transaction that is rolled back at the end: a
  // resolver that reads on its own connection cannot see the uncommitted row, and nothing is left
  // behind for a later test.
  it('resolves a vehicle inserted earlier in the same open transaction', async () => {
    const runner = new TypeOrmTransactionRunner(dataSource);
    const rollback = new Error('discard the fixture');
    let vehicle!: VehicleKeys;
    let inside!: {
      internalId: string | null;
      externalId: string | null;
      internalIds: Map<string, string>;
      externalIds: Map<string, string>;
    };

    await expect(
      runner.run(async () => {
        vehicle = await insertVehicle(currentEntityManager()!);
        inside = {
          internalId: await resolver.toInternalId(vehicle.externalId),
          externalId: await resolver.toExternalId(vehicle.id),
          internalIds: await resolver.toInternalIds([vehicle.externalId]),
          externalIds: await resolver.toExternalIds([vehicle.id]),
        };
        throw rollback;
      }),
    ).rejects.toThrow(rollback);

    expect(inside.internalId).toBe(vehicle.id);
    expect(inside.externalId).toBe(vehicle.externalId);
    expect(inside.internalIds).toEqual(new Map([[vehicle.externalId, vehicle.id]]));
    expect(inside.externalIds).toEqual(new Map([[vehicle.id, vehicle.externalId]]));
    expect(await resolver.toInternalId(vehicle.externalId)).toBeNull();
  });
});
