import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleId } from '../../../domain/value-objects/role-id';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
export class DeleteRoleHandler implements ICommandHandler<DeleteRoleCommand, void> {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository) {}

  async execute(command: DeleteRoleCommand): Promise<void> {
    const role = await this.roles.findById(RoleId.create(command.roleId));
    if (!role) {
      throw new RoleNotFoundError();
    }
    role.ensureDeletable();
    await this.roles.delete(role);
  }
}
