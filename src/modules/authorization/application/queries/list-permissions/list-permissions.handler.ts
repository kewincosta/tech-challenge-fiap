import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PermissionDto, RBAC_QUERY_PORT, RbacQueryPort } from '../../ports/rbac-query.port';
import { ListPermissionsQuery } from './list-permissions.query';

@QueryHandler(ListPermissionsQuery)
export class ListPermissionsHandler
  implements IQueryHandler<ListPermissionsQuery, PermissionDto[]>
{
  constructor(@Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort) {}

  async execute(): Promise<PermissionDto[]> {
    return this.rbacQuery.listPermissions();
  }
}
