import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { IdGenerator } from '../../../../../../shared/application/ports/id-generator.port';
import { Role } from '../../../domain/entities/role';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { RoleRepository } from '../../ports/role.repository';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { CreatedRoleDto, CreateRoleCommand } from './create-role.command';

export class CreateRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissionCatalog: PermissionCatalogService,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateRoleCommand): Promise<CreatedRoleDto> {
    const name = RoleName.create(command.name);
    if (await this.roles.existsByName(name)) {
      throw new RoleNameAlreadyInUseError();
    }
    const permissionIds = await this.permissionCatalog.resolveIdsByCodes(command.permissions);
    const role = Role.create({
      id: RoleId.create(this.idGenerator.generate()),
      name,
      description: command.description,
      permissionIds,
      now: this.clock.now(),
    });
    await this.roles.save(role);
    return { id: role.id.value };
  }
}
