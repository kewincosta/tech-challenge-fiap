import { Role } from '../../../src/modules/identity/authorization/domain/entities/role';
import { RoleRepository } from '../../../src/modules/identity/authorization/application/ports/role.repository';
import { RoleId } from '../../../src/modules/identity/authorization/domain/value-objects/role-id';
import { RoleName } from '../../../src/modules/identity/authorization/domain/value-objects/role-name';

// A database hands back a new object each time, so a change to a role it handed out reaches the
// store only through `save`.
function copyOf(role: Role): Role {
  return Role.restore({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionIds: [...role.permissionIds],
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  });
}

export class InMemoryRoleRepository implements RoleRepository {
  roles: Role[] = [];

  async findById(id: RoleId): Promise<Role | null> {
    const found = this.roles.find((role) => role.id.equals(id));
    return Promise.resolve(found ? copyOf(found) : null);
  }

  async findByIds(ids: RoleId[]): Promise<Role[]> {
    return Promise.resolve(
      this.roles.filter((role) => ids.some((id) => role.id.equals(id))).map(copyOf),
    );
  }

  async findByName(name: RoleName): Promise<Role | null> {
    const found = this.roles.find((role) => role.name.equals(name));
    return Promise.resolve(found ? copyOf(found) : null);
  }

  async existsByName(name: RoleName): Promise<boolean> {
    return Promise.resolve(this.roles.some((role) => role.name.equals(name)));
  }

  async save(role: Role): Promise<void> {
    this.roles = this.roles.filter((existing) => !existing.id.equals(role.id));
    this.roles.push(copyOf(role));
    return Promise.resolve();
  }

  async delete(role: Role): Promise<void> {
    this.roles = this.roles.filter((existing) => !existing.id.equals(role.id));
    return Promise.resolve();
  }
}
