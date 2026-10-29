import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleRepository } from '../../ports/role.repository';
import { DeleteRoleCommand } from './delete-role.command';

export class DeleteRoleHandler {
  constructor(private readonly roles: RoleRepository) {}

  async execute(command: DeleteRoleCommand): Promise<void> {
    const role = await this.roles.findById(RoleId.create(command.roleId));
    if (!role) {
      throw new RoleNotFoundError();
    }
    role.ensureDeletable();
    await this.roles.delete(role);
  }
}
