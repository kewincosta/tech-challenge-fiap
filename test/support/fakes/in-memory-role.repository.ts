import { Role } from '../../../src/modules/authorization/domain/entities/role';
import { RoleRepository } from '../../../src/modules/authorization/domain/repositories/role.repository';
import { RoleId } from '../../../src/modules/authorization/domain/value-objects/role-id';
import { RoleName } from '../../../src/modules/authorization/domain/value-objects/role-name';

export class InMemoryRoleRepository implements RoleRepository {
  roles: Role[] = [];

  async findById(id: RoleId): Promise<Role | null> {
    return Promise.resolve(this.roles.find((role) => role.id.equals(id)) ?? null);
  }

  async findByIds(ids: RoleId[]): Promise<Role[]> {
    return Promise.resolve(this.roles.filter((role) => ids.some((id) => role.id.equals(id))));
  }

  async findByName(name: RoleName): Promise<Role | null> {
    return Promise.resolve(this.roles.find((role) => role.name.equals(name)) ?? null);
  }

  async existsByName(name: RoleName): Promise<boolean> {
    return Promise.resolve(this.roles.some((role) => role.name.equals(name)));
  }

  async save(role: Role): Promise<void> {
    this.roles = this.roles.filter((existing) => !existing.id.equals(role.id));
    this.roles.push(role);
    return Promise.resolve();
  }

  async delete(role: Role): Promise<void> {
    this.roles = this.roles.filter((existing) => !existing.id.equals(role.id));
    return Promise.resolve();
  }
}
