import { Role } from '../entities/role';
import { RoleId } from '../value-objects/role-id';
import { RoleName } from '../value-objects/role-name';

export interface RoleRepository {
  findById(id: RoleId): Promise<Role | null>;
  findByIds(ids: RoleId[]): Promise<Role[]>;
  findByName(name: RoleName): Promise<Role | null>;
  existsByName(name: RoleName): Promise<boolean>;
  save(role: Role): Promise<void>;
  delete(role: Role): Promise<void>;
}

export const ROLE_REPOSITORY = Symbol('RoleRepository');
