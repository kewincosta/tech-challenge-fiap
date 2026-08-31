import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { RoleRevokedFromUser } from '../../../domain/events/role-revoked-from-user.event';
import { RoleId } from '../../../domain/value-objects/role-id';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../../ports/assignment.repository';
import { RevokeRoleFromUserCommand } from './revoke-role-from-user.command';

@CommandHandler(RevokeRoleFromUserCommand)
export class RevokeRoleFromUserHandler
  implements ICommandHandler<RevokeRoleFromUserCommand, void>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RevokeRoleFromUserCommand): Promise<void> {
    const roleId = RoleId.create(command.roleId);
    const removed = await this.assignments.removeRoleFromUser(command.userId, roleId.value);
    if (removed) {
      this.eventBus.publish(
        new RoleRevokedFromUser(command.userId, roleId.value, this.clock.now()),
      );
    }
  }
}
