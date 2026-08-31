import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TypeOrmEffectiveAccessReader } from '../../src/modules/authorization/infrastructure/persistence/typeorm-effective-access.reader';
import { createTestDataSource } from '../support/db';

const NOW = new Date('2026-08-26T12:00:00.000Z');

let dataSource: DataSource;
let reader: TypeOrmEffectiveAccessReader;

function uniqueRoleName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function uniqueDigits(length: number): string {
  let digits = '';
  while (digits.length < length) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits.slice(0, length);
}

async function insertUser(): Promise<string> {
  const externalId = randomUUID();
  await dataSource.query(
    `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
     VALUES ($1, $2, 'hashed', 'Jane Doe', $3, 'ACTIVE', $4, $4)`,
    [externalId, `${externalId}@example.com`, uniqueDigits(11), NOW],
  );
  return externalId;
}

async function insertRole(name: string, permissionCodes: string[]): Promise<string> {
  const rows: Array<{ id: string }> = await dataSource.query(
    `INSERT INTO roles (external_id, name, description, is_system, created_at, updated_at)
     VALUES ($1, $2, NULL, false, $3, $3) RETURNING id`,
    [randomUUID(), name, NOW],
  );
  const roleInternalId = rows[0].id;
  if (permissionCodes.length > 0) {
    await dataSource.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2)`,
      [roleInternalId, permissionCodes],
    );
  }
  return roleInternalId;
}

async function assignRole(userExternalId: string, roleInternalId: string): Promise<void> {
  const userRows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM users WHERE external_id = $1`,
    [userExternalId],
  );
  await dataSource.query(
    `INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, $3)`,
    [userRows[0].id, roleInternalId, NOW],
  );
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  reader = new TypeOrmEffectiveAccessReader(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('TypeOrmEffectiveAccessReader', () => {
  it('should return empty access for a user without roles', async () => {
    const userId = await insertUser();

    const access = await reader.read(userId);

    expect(access).toEqual({ roles: [], permissions: [] });
  });

  it('should resolve permissions granted by a direct role', async () => {
    const userId = await insertUser();
    const roleName = uniqueRoleName('DIRECT');
    await assignRole(userId, await insertRole(roleName, ['users:read']));

    const access = await reader.read(userId);

    expect(access.roles).toEqual([roleName]);
    expect(access.permissions).toEqual(['users:read']);
  });

  it('should deduplicate permissions granted by more than one role', async () => {
    const userId = await insertUser();
    const firstRoleName = uniqueRoleName('FIRST');
    const secondRoleName = uniqueRoleName('SECOND');
    await assignRole(userId, await insertRole(firstRoleName, ['users:read']));
    await assignRole(userId, await insertRole(secondRoleName, ['users:read']));

    const access = await reader.read(userId);

    expect(access.permissions).toEqual(['users:read']);
    expect(access.roles.sort()).toEqual([firstRoleName, secondRoleName].sort());
  });
});
