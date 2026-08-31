import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RBAC_QUERY_PORT, RbacQueryPort, RoleDto } from '../../ports/rbac-query.port';
import { ListRolesQuery } from './list-roles.query';

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery, RoleDto[]> {
  constructor(@Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort) {}

  async execute(): Promise<RoleDto[]> {
    return this.rbacQuery.listRoles();
  }
}
