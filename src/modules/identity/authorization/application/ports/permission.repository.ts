import { Permission } from '../../domain/entities/permission';
import { PermissionCode } from '../../domain/value-objects/permission-code';
import { PermissionId } from '../../domain/value-objects/permission-id';

export interface PermissionRepository {
  findAll(): Promise<Permission[]>;
  findByIds(ids: PermissionId[]): Promise<Permission[]>;
  findByCodes(codes: PermissionCode[]): Promise<Permission[]>;
}
