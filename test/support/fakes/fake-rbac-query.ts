import {
  PermissionDto,
  RbacQueryPort,
  RoleDto,
  UserAccessDto,
} from '../../../src/modules/identity/authorization/application/ports/rbac-query.port';

/** Holds the roles, permissions and user access it is given and answers only for those, as the adapter does. */
export class FakeRbacQuery implements RbacQueryPort {
  private roles: RoleDto[] = [];
  private permissions: PermissionDto[] = [];
  private readonly userAccess = new Map<string, UserAccessDto>();

  /** Seeds the roles the port lists. */
  withRoles(roles: RoleDto[]): this {
    this.roles = roles;
    return this;
  }

  /** Seeds the permission catalog the port lists. */
  withPermissions(permissions: PermissionDto[]): this {
    this.permissions = permissions;
    return this;
  }

  /** Seeds the roles one user holds; a user left out holds none. */
  withUserAccess(userId: string, access: UserAccessDto): this {
    this.userAccess.set(userId, access);
    return this;
  }

  async listRoles(): Promise<RoleDto[]> {
    return Promise.resolve([...this.roles]);
  }

  async getRoleById(roleId: string): Promise<RoleDto | null> {
    return Promise.resolve(this.roles.find((role) => role.id === roleId) ?? null);
  }

  async listPermissions(): Promise<PermissionDto[]> {
    return Promise.resolve([...this.permissions]);
  }

  async getUserAccess(userId: string): Promise<UserAccessDto> {
    return Promise.resolve(this.userAccess.get(userId) ?? { roles: [] });
  }
}
