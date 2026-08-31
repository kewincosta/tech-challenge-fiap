import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createTestDataSource } from '../support/db';

const NOW = new Date('2026-08-30T12:00:00.000Z');

const SUPER_ADMIN_PERMISSIONS = [
  'audit:read',
  'customers:manage',
  'customers:read',
  'inventory:manage',
  'inventory:read',
  'metrics:read',
  'permissions:read',
  'roles:manage',
  'roles:read',
  'services:manage',
  'services:read',
  'sessions:revoke-any',
  'user-access:manage',
  'user-access:read',
  'users:manage',
  'users:read',
  'vehicles:manage',
  'vehicles:read',
  'work-orders:cancel',
  'work-orders:cancel-in-execution',
  'work-orders:decide',
  'work-orders:discount',
  'work-orders:execute',
  'work-orders:manage',
  'work-orders:read',
].sort();

const ADMIN_PERMISSIONS = [
  'audit:read',
  'customers:manage',
  'customers:read',
  'inventory:manage',
  'inventory:read',
  'metrics:read',
  'permissions:read',
  'roles:read',
  'services:manage',
  'services:read',
  'sessions:revoke-any',
  'user-access:manage',
  'user-access:read',
  'users:manage',
  'users:read',
  'vehicles:manage',
  'vehicles:read',
  'work-orders:cancel',
  'work-orders:cancel-in-execution',
  'work-orders:decide',
  'work-orders:discount',
  'work-orders:execute',
  'work-orders:manage',
  'work-orders:read',
].sort();

const SERVICE_ADVISOR_PERMISSIONS = [
  'customers:manage',
  'customers:read',
  'inventory:read',
  'metrics:read',
  'services:read',
  'vehicles:manage',
  'vehicles:read',
  'work-orders:cancel',
  'work-orders:decide',
  'work-orders:manage',
  'work-orders:read',
].sort();

const MECHANIC_PERMISSIONS = [
  'customers:read',
  'inventory:read',
  'services:read',
  'vehicles:read',
  'work-orders:execute',
  'work-orders:read',
].sort();

const CUSTOMER_PERMISSIONS = ['work-orders:decide-own', 'work-orders:read-own'].sort();

let dataSource: DataSource;

function uniqueDigits(length: number): string {
  let digits = '';
  while (digits.length < length) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits.slice(0, length);
}

async function insertUser(overrides: {
  email?: string;
  document?: string;
  deletedAt?: Date | null;
}): Promise<void> {
  const email = overrides.email ?? `${randomUUID()}@example.com`;
  const document = overrides.document ?? uniqueDigits(11);
  await dataSource.query(
    `INSERT INTO users
       (external_id, email, password_hash, name, document, must_change_password, status,
        created_at, updated_at, deleted_at)
     VALUES ($1, $2, 'hashed', 'Jane Doe', $3, false, 'ACTIVE', $4, $4, $5)`,
    [randomUUID(), email, document, NOW, overrides.deletedAt ?? null],
  );
}

async function grantedPermissions(roleName: string): Promise<string[]> {
  const rows: Array<{ code: string }> = await dataSource.query(
    `SELECT p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.name = $1
      ORDER BY p.code`,
    [roleName],
  );
  return rows.map((row) => row.code).sort();
}

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('identity schema and RBAC seed migration', () => {
  it('gives users, roles, permissions, sessions and refresh_tokens a bigserial id and a unique external_id', async () => {
    const tables = ['users', 'roles', 'permissions', 'sessions', 'refresh_tokens'];

    for (const table of tables) {
      const columns: Array<{
        column_name: string;
        data_type: string;
        udt_name: string;
        column_default: string | null;
      }> = await dataSource.query(
        `SELECT column_name, data_type, udt_name, column_default
           FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('id', 'external_id')`,
        [table],
      );
      const idColumn = columns.find((column) => column.column_name === 'id');
      const externalIdColumn = columns.find((column) => column.column_name === 'external_id');

      expect(idColumn?.data_type).toBe('bigint');
      expect(idColumn?.column_default).toContain('nextval(');
      expect(externalIdColumn?.udt_name).toBe('uuid');

      const uniqueConstraints: Array<{ constraint_name: string }> = await dataSource.query(
        `SELECT tc.constraint_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
          WHERE tc.table_name = $1 AND tc.constraint_type = 'UNIQUE' AND kcu.column_name = 'external_id'`,
        [table],
      );
      expect(uniqueConstraints.length).toBeGreaterThan(0);
    }
  });

  it('keeps a composite primary key of internal bigint keys on user_roles and role_permissions', async () => {
    const joinTables: Array<{ table: string; columns: string[] }> = [
      { table: 'user_roles', columns: ['user_id', 'role_id'] },
      { table: 'role_permissions', columns: ['role_id', 'permission_id'] },
    ];

    for (const { table, columns } of joinTables) {
      const columnTypes: Array<{ column_name: string; data_type: string }> = await dataSource.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND column_name = ANY($2::text[])`,
        [table, columns],
      );
      for (const column of columns) {
        expect(columnTypes.find((row) => row.column_name === column)?.data_type).toBe('bigint');
      }

      const primaryKeyColumns: Array<{ column_name: string }> = await dataSource.query(
        `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
          WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
          ORDER BY kcu.ordinal_position`,
        [table],
      );
      expect(primaryKeyColumns.map((row) => row.column_name)).toEqual(columns);
    }
  });

  it('creates no group table', async () => {
    const groupTables: Array<{ table_name: string }> = await dataSource.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('groups', 'user_groups', 'group_roles', 'group_permissions')`,
    );

    expect(groupTables).toHaveLength(0);
  });

  it('adds a not-null document and a not-null must_change_password defaulting to false on users', async () => {
    const columns: Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }> = await dataSource.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('document', 'must_change_password')`,
    );
    const document = columns.find((column) => column.column_name === 'document');
    const mustChangePassword = columns.find(
      (column) => column.column_name === 'must_change_password',
    );

    expect(document?.data_type).toBe('character varying');
    expect(document?.character_maximum_length).toBe(14);
    expect(document?.is_nullable).toBe('NO');

    expect(mustChangePassword?.data_type).toBe('boolean');
    expect(mustChangePassword?.is_nullable).toBe('NO');
    expect(mustChangePassword?.column_default).toContain('false');
  });

  it('enforces partial unique indexes on email and document filtered by deleted_at IS NULL', async () => {
    const email = `${randomUUID()}@example.com`;
    const document = uniqueDigits(11);
    await insertUser({ email, document });

    await expect(insertUser({ email, document: uniqueDigits(11) })).rejects.toThrow();
    await expect(insertUser({ email: `${randomUUID()}@example.com`, document })).rejects.toThrow();

    await insertUser({ email, document: uniqueDigits(11), deletedAt: NOW });
    await insertUser({ email: `${randomUUID()}@example.com`, document, deletedAt: NOW });
  });

  it('keeps the refresh token self reference deferrable and initially deferred', async () => {
    const constraints: Array<{ is_deferrable: string; initially_deferred: string }> =
      await dataSource.query(
        `SELECT is_deferrable, initially_deferred FROM information_schema.table_constraints
          WHERE table_name = 'refresh_tokens' AND constraint_name = 'fk_refresh_tokens_replaced_by'`,
      );

    expect(constraints).toHaveLength(1);
    expect(constraints[0].is_deferrable).toBe('YES');
    expect(constraints[0].initially_deferred).toBe('YES');
  });

  it('grants SUPER_ADMIN its explicit permission set, including roles:manage', async () => {
    const granted = await grantedPermissions('SUPER_ADMIN');

    expect(granted).toEqual(SUPER_ADMIN_PERMISSIONS);
    expect(granted).toContain('roles:manage');
  });

  it('grants ADMIN its explicit permission set, without roles:manage', async () => {
    const granted = await grantedPermissions('ADMIN');

    expect(granted).toEqual(ADMIN_PERMISSIONS);
    expect(granted).not.toContain('roles:manage');
  });

  it('grants SERVICE_ADVISOR its explicit permission set', async () => {
    const granted = await grantedPermissions('SERVICE_ADVISOR');

    expect(granted).toEqual(SERVICE_ADVISOR_PERMISSIONS);
  });

  it('grants MECHANIC its explicit permission set', async () => {
    const granted = await grantedPermissions('MECHANIC');

    expect(granted).toEqual(MECHANIC_PERMISSIONS);
  });

  it('grants CUSTOMER its explicit permission set', async () => {
    const granted = await grantedPermissions('CUSTOMER');

    expect(granted).toEqual(CUSTOMER_PERMISSIONS);
  });
});
