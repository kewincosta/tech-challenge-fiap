export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface GroupDto {
  id: string;
  name: string;
  description: string | null;
  roles: string[];
  permissions: string[];
}

export interface PermissionDto {
  id: string;
  code: string;
  description: string | null;
}

export interface UserAccessRoleDto {
  id: string;
  name: string;
}

export interface UserAccessGroupDto {
  id: string;
  name: string;
}

export interface UserAccessDto {
  roles: UserAccessRoleDto[];
  groups: UserAccessGroupDto[];
}

export interface RbacQueryPort {
  listRoles(): Promise<RoleDto[]>;
  getRoleById(roleId: string): Promise<RoleDto | null>;
  listGroups(): Promise<GroupDto[]>;
  getGroupById(groupId: string): Promise<GroupDto | null>;
  listPermissions(): Promise<PermissionDto[]>;
  getUserAccess(userId: string): Promise<UserAccessDto>;
}

export const RBAC_QUERY_PORT = Symbol('RbacQueryPort');
