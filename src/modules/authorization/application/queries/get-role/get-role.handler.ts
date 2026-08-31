import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RBAC_QUERY_PORT, RbacQueryPort, RoleDto } from '../../ports/rbac-query.port';
import { GetRoleQuery } from './get-role.query';

@QueryHandler(GetRoleQuery)
export class GetRoleHandler implements IQueryHandler<GetRoleQuery, RoleDto | null> {
  constructor(@Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort) {}

  async execute(query: GetRoleQuery): Promise<RoleDto | null> {
    return this.rbacQuery.getRoleById(query.roleId);
  }
}
