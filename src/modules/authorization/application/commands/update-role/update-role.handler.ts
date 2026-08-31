import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { UpdateRoleCommand } from './update-role.command';

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<UpdateRoleCommand, void> {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<void> {
    const role = await this.roles.findById(RoleId.create(command.roleId));
    if (!role) {
      throw new RoleNotFoundError();
    }
    let name: RoleName | undefined;
    if (command.name !== undefined) {
      name = RoleName.create(command.name);
      if (!name.equals(role.name) && (await this.roles.existsByName(name))) {
        throw new RoleNameAlreadyInUseError();
      }
    }
    role.update({ name, description: command.description }, this.clock.now());
    await this.roles.save(role);
  }
}
