import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RbacQueryPort, RoleDto } from '../../ports/rbac-query.port';
import { GetRoleQuery } from './get-role.query';

export class GetRoleUseCase {
  constructor(private readonly rbacQuery: RbacQueryPort) {}

  async execute(query: GetRoleQuery): Promise<RoleDto> {
    const role = await this.rbacQuery.getRoleById(query.roleId);
    if (!role) {
      throw new RoleNotFoundError();
    }
    return role;
  }
}
