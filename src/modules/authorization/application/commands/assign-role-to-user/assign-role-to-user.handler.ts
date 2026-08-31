import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { Role } from '../../../domain/entities/role';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RoleNotFoundError } from '../../../domain/errors/role-not-found.error';
import { RoleAssignedToUser } from '../../../domain/events/role-assigned-to-user.event';
import { ROLE_REPOSITORY, RoleRepository } from '../../../domain/repositories/role.repository';
import { RoleId } from '../../../domain/value-objects/role-id';
import { RoleName } from '../../../domain/value-objects/role-name';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../../ports/assignment.repository';
import { AssignRoleToUserCommand, RoleReference } from './assign-role-to-user.command';

@CommandHandler(AssignRoleToUserCommand)
export class AssignRoleToUserHandler implements ICommandHandler<AssignRoleToUserCommand, void> {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AssignRoleToUserCommand): Promise<void> {
    await this.ensureUserExists(command.userId);
    const role = await this.resolveRole(command.role);
    await this.assignments.assignRoleToUser(command.userId, role.id.value);
    this.eventBus.publish(
      new RoleAssignedToUser(command.userId, role.id.value, role.name.value, this.clock.now()),
    );
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(userId),
    );
    if (!user) {
      throw new AssignedUserNotFoundError();
    }
  }

  private async resolveRole(reference: RoleReference): Promise<Role> {
    if (reference.id) {
      const role = await this.roles.findById(RoleId.create(reference.id));
      if (role) {
        return role;
      }
    } else if (reference.name) {
      const role = await this.roles.findByName(RoleName.create(reference.name));
      if (role) {
        return role;
      }
    }
    throw new RoleNotFoundError();
  }
}
