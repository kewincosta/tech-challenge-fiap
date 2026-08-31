import { Permission } from '../entities/permission';
import { PermissionCode } from '../value-objects/permission-code';
import { PermissionId } from '../value-objects/permission-id';

export interface PermissionRepository {
  findAll(): Promise<Permission[]>;
  findByIds(ids: PermissionId[]): Promise<Permission[]>;
  findByCodes(codes: PermissionCode[]): Promise<Permission[]>;
}

export const PERMISSION_REPOSITORY = Symbol('PermissionRepository');
