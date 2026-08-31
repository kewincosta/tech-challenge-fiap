import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleId } from '../../../domain/value-objects/role-id';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { SetRolePermissionsCommand } from './set-role-permissions.command';

@CommandHandler(SetRolePermissionsCommand)
export class SetRolePermissionsHandler
  implements ICommandHandler<SetRolePermissionsCommand, void>
{
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly permissionCatalog: PermissionCatalogService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetRolePermissionsCommand): Promise<void> {
    const role = await this.roles.findById(RoleId.create(command.roleId));
    if (!role) {
      throw new RoleNotFoundError();
    }
    const permissionIds = await this.permissionCatalog.resolveIdsByCodes(command.permissions);
    role.setPermissions(permissionIds, this.clock.now());
    await this.roles.save(role);
  }
}
