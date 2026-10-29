import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleRepository } from '../../ports/role.repository';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { SetRolePermissionsCommand } from './set-role-permissions.command';

export class SetRolePermissionsHandler {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissionCatalog: PermissionCatalogService,
    private readonly clock: Clock,
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
