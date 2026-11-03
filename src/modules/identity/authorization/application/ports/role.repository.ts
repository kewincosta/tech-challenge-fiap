import { Role } from '../../domain/entities/role';
import { RoleId } from '../../domain/value-objects/role-id';
import { RoleName } from '../../domain/value-objects/role-name';

export interface RoleRepository {
  findById(id: RoleId): Promise<Role | null>;
  findByIds(ids: RoleId[]): Promise<Role[]>;
  findByName(name: RoleName): Promise<Role | null>;
  existsByName(name: RoleName): Promise<boolean>;
  save(role: Role): Promise<void>;
  delete(role: Role): Promise<void>;
}
