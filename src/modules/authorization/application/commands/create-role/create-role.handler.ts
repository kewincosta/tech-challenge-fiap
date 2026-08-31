import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Role } from '../../../domain/entities/role';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { PermissionCatalogService } from '../../services/permission-catalog.service';
import { CreatedRoleDto, CreateRoleCommand } from './create-role.command';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand, CreatedRoleDto> {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly permissionCatalog: PermissionCatalogService,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
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
