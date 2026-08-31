import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SystemRoleImmutableError } from '../errors/system-role-immutable.error';
import { RoleId } from '../value-objects/role-id';
import { RoleName } from '../value-objects/role-name';
import { Role } from './role';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const LATER = new Date('2026-08-26T13:00:00.000Z');

function buildRole(permissionIds: string[] = []): Role {
  return Role.create({
    id: RoleId.create(randomUUID()),
    name: RoleName.create('WORKSHOP_MANAGER'),
    description: null,
    permissionIds,
    now: NOW,
  });
}

function buildSystemRole(): Role {
  return Role.restore({
    id: RoleId.create(randomUUID()),
    name: RoleName.create('ADMIN'),
    description: null,
    isSystem: true,
    permissionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Role', () => {
  it('should create a non system role', () => {
    const role = buildRole();

    expect(role.isSystem).toBe(false);
    expect(role.name.value).toBe('WORKSHOP_MANAGER');
  });

  it('should deduplicate the assigned permissions', () => {
    const permissionId = randomUUID();
    const role = buildRole([permissionId, permissionId]);

    expect(role.permissionIds).toEqual([permissionId]);
  });

  it('should replace its permissions', () => {
    const role = buildRole([randomUUID()]);
    const replacement = randomUUID();

    role.setPermissions([replacement], LATER);

    expect(role.permissionIds).toEqual([replacement]);
    expect(role.updatedAt).toEqual(LATER);
  });

  it('should not expose a mutable permission collection', () => {
    const role = buildRole([randomUUID()]);

    const snapshot = role.permissionIds as string[];
    snapshot.push('injected');

    expect(role.permissionIds).toHaveLength(1);
  });

  it('should not rename a system role', () => {
    const role = buildSystemRole();

    expect(() => role.update({ name: RoleName.create('SUPERADMIN') }, LATER)).toThrow(
      SystemRoleImmutableError,
    );
  });

  it('should not delete a system role', () => {
    const role = buildSystemRole();

    expect(() => role.ensureDeletable()).toThrow(SystemRoleImmutableError);
  });

  it('should update the description of a system role', () => {
    const role = buildSystemRole();

    role.update({ description: 'Full access' }, LATER);

    expect(role.description).toBe('Full access');
  });
});
