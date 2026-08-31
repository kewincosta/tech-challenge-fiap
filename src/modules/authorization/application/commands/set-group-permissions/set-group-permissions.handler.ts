import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { GroupNotFoundError } from '../../../domain/errors/group-not-found.error';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { SetGroupPermissionsCommand } from './set-group-permissions.command';

@CommandHandler(SetGroupPermissionsCommand)
export class SetGroupPermissionsHandler
  implements ICommandHandler<SetGroupPermissionsCommand, void>
{
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    private readonly permissionCatalog: PermissionCatalogService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetGroupPermissionsCommand): Promise<void> {
    const group = await this.groups.findById(GroupId.create(command.groupId));
    if (!group) {
      throw new GroupNotFoundError();
    }
    const permissionIds = await this.permissionCatalog.resolveIdsByCodes(command.permissions);
    group.setPermissions(permissionIds, this.clock.now());
    await this.groups.save(group);
  }
}
