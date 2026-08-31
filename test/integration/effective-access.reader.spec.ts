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

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await dataSource.query(
    `INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
     VALUES ($1, $2, 'hashed', 'Jane Doe', 'ACTIVE', $3, $3)`,
    [id, `${id}@example.com`, NOW],
  );
  return id;
}

async function insertRole(name: string, permissionCodes: string[]): Promise<string> {
  const id = randomUUID();
  await dataSource.query(
    `INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
     VALUES ($1, $2, NULL, false, $3, $3)`,
    [id, name, NOW],
  );
  if (permissionCodes.length > 0) {
    await dataSource.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2)`,
      [id, permissionCodes],
    );
  }
  return id;
}

async function insertGroup(roleIds: string[], permissionCodes: string[]): Promise<string> {
  const id = randomUUID();
  await dataSource.query(
    `INSERT INTO groups (id, name, description, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, $3)`,
    [id, `group-${id}`, NOW],
  );
  for (const roleId of roleIds) {
    await dataSource.query(`INSERT INTO group_roles (group_id, role_id) VALUES ($1, $2)`, [
      id,
      roleId,
    ]);
  }
  if (permissionCodes.length > 0) {
    await dataSource.query(
      `INSERT INTO group_permissions (group_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2)`,
      [id, permissionCodes],
    );
  }
  return id;
}

async function assignRole(userId: string, roleId: string): Promise<void> {
  await dataSource.query(
    `INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, $3)`,
    [userId, roleId, NOW],
  );
}

async function assignGroup(userId: string, groupId: string): Promise<void> {
  await dataSource.query(
    `INSERT INTO user_groups (user_id, group_id, created_at) VALUES ($1, $2, $3)`,
    [userId, groupId, NOW],
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
  it('should return empty access for a user without roles or groups', async () => {
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

  it('should resolve permissions granted through a group role', async () => {
    const userId = await insertUser();
    const roleName = uniqueRoleName('GROUPED');
    const roleId = await insertRole(roleName, ['roles:read']);
    await assignGroup(userId, await insertGroup([roleId], []));

    const access = await reader.read(userId);

    expect(access.roles).toEqual([roleName]);
    expect(access.permissions).toEqual(['roles:read']);
  });

  it('should resolve permissions granted directly by a group', async () => {
    const userId = await insertUser();
    await assignGroup(userId, await insertGroup([], ['groups:read']));

    const access = await reader.read(userId);

    expect(access.roles).toEqual([]);
    expect(access.permissions).toEqual(['groups:read']);
  });

  it('should deduplicate permissions granted by several paths', async () => {
    const userId = await insertUser();
    const directRoleName = uniqueRoleName('DIRECT');
    const groupRoleName = uniqueRoleName('GROUPED');
    const groupRoleId = await insertRole(groupRoleName, ['users:read']);
    await assignRole(userId, await insertRole(directRoleName, ['users:read']));
    await assignGroup(userId, await insertGroup([groupRoleId], ['users:read']));

    const access = await reader.read(userId);

    expect(access.permissions).toEqual(['users:read']);
    expect(access.roles.sort()).toEqual([directRoleName, groupRoleName].sort());
  });
});
