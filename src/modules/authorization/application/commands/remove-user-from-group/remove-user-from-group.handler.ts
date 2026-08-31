import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { UserRemovedFromGroup } from '../../../domain/events/user-removed-from-group.event';
import { GroupId } from '../../../domain/value-objects/group-id';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../../ports/assignment.repository';
import { RemoveUserFromGroupCommand } from './remove-user-from-group.command';

@CommandHandler(RemoveUserFromGroupCommand)
export class RemoveUserFromGroupHandler
  implements ICommandHandler<RemoveUserFromGroupCommand, void>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveUserFromGroupCommand): Promise<void> {
    const groupId = GroupId.create(command.groupId);
    const removed = await this.assignments.removeUserFromGroup(command.userId, groupId.value);
    if (removed) {
      this.eventBus.publish(
        new UserRemovedFromGroup(command.userId, groupId.value, this.clock.now()),
      );
    }
  }
}
