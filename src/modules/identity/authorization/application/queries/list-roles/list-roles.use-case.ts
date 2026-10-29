import { RbacQueryPort, RoleDto } from '../../ports/rbac-query.port';
import { ListRolesQuery } from './list-roles.query';

export class ListRolesUseCase {
  constructor(private readonly rbacQuery: RbacQueryPort) {}

  async execute(_query: ListRolesQuery): Promise<RoleDto[]> {
    return this.rbacQuery.listRoles();
  }
}
