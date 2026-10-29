import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { RoleRevokedFromUser } from '../../../domain/events/role-revoked-from-user.event';
import { RoleId } from '../../../domain/value-objects/role-id';
import { AssignmentRepository } from '../../ports/assignment.repository';
import { RevokeRoleFromUserCommand } from './revoke-role-from-user.command';

export class RevokeRoleFromUserHandler {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RevokeRoleFromUserCommand): Promise<void> {
    const roleId = RoleId.create(command.roleId);
    const removed = await this.assignments.removeRoleFromUser(command.userId, roleId.value);
    if (removed) {
      this.events.publish([
        new RoleRevokedFromUser(command.userId, roleId.value, this.clock.now()),
      ]);
    }
  }
}
