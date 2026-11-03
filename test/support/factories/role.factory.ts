import { randomUUID } from 'node:crypto';
import { Role } from '../../../src/modules/identity/authorization/domain/entities/role';
import { RoleId } from '../../../src/modules/identity/authorization/domain/value-objects/role-id';
import { RoleName } from '../../../src/modules/identity/authorization/domain/value-objects/role-name';

export interface RoleFactoryOverrides {
  id?: string;
  name?: string;
  description?: string | null;
  permissionIds?: string[];
  /** A system role, the way the repository restores one; the default is a role created through the API. */
  isSystem?: boolean;
  now?: Date;
}

export function buildRole(overrides: RoleFactoryOverrides = {}): Role {
  const now = overrides.now ?? new Date('2026-08-26T12:00:00.000Z');
  const fields = {
    id: RoleId.create(overrides.id ?? randomUUID()),
    name: RoleName.create(overrides.name ?? 'WORKSHOP_MANAGER'),
    description: overrides.description ?? null,
    permissionIds: overrides.permissionIds ?? [],
  };
  return overrides.isSystem
    ? Role.restore({ ...fields, isSystem: true, createdAt: now, updatedAt: now })
    : Role.create({ ...fields, now });
}
