import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { GroupNotFoundError } from '../../../domain/errors/group-not-found.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { RoleId } from '../../../domain/value-objects/role-id';
import { SetGroupRolesCommand } from './set-group-roles.command';

@CommandHandler(SetGroupRolesCommand)
export class SetGroupRolesHandler implements ICommandHandler<SetGroupRolesCommand, void> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetGroupRolesCommand): Promise<void> {
    const group = await this.groups.findById(GroupId.create(command.groupId));
    if (!group) {
      throw new GroupNotFoundError();
    }
    const uniqueRoleIds = [...new Set(command.roleIds)].map((roleId) => RoleId.create(roleId));
    const foundRoles = await this.roles.findByIds(uniqueRoleIds);
    if (foundRoles.length !== uniqueRoleIds.length) {
      throw new RoleNotFoundError();
    }
    group.setRoles(
      uniqueRoleIds.map((roleId) => roleId.value),
      this.clock.now(),
    );
    await this.groups.save(group);
  }
}
