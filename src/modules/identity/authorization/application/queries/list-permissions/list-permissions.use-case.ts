import { PermissionDto, RbacQueryPort } from '../../ports/rbac-query.port';
import { ListPermissionsQuery } from './list-permissions.query';

export class ListPermissionsUseCase {
  constructor(private readonly rbacQuery: RbacQueryPort) {}

  async execute(_query: ListPermissionsQuery): Promise<PermissionDto[]> {
    return this.rbacQuery.listPermissions();
  }
}
