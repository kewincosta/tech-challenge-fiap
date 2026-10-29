import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { RoleNameAlreadyInUseError } from '../../../domain/errors/role-name-already-in-use.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { RoleRepository } from '../../ports/role.repository';
import { UpdateRoleCommand } from './update-role.command';

export class UpdateRoleHandler {
  constructor(
    private readonly roles: RoleRepository,
    private readonly clock: Clock,
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
