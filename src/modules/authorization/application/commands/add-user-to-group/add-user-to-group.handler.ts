import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { GroupNotFoundError } from '../../../domain/errors/group-not-found.error';
import { UserAddedToGroup } from '../../../domain/events/user-added-to-group.event';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../../ports/assignment.repository';
import { AddUserToGroupCommand } from './add-user-to-group.command';

@CommandHandler(AddUserToGroupCommand)
export class AddUserToGroupHandler implements ICommandHandler<AddUserToGroupCommand, void> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddUserToGroupCommand): Promise<void> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(command.userId),
    );
    if (!user) {
      throw new AssignedUserNotFoundError();
    }
    const group = await this.groups.findById(GroupId.create(command.groupId));
    if (!group) {
      throw new GroupNotFoundError();
    }
    await this.assignments.addUserToGroup(command.userId, group.id.value);
    this.eventBus.publish(new UserAddedToGroup(command.userId, group.id.value, this.clock.now()));
  }
}
