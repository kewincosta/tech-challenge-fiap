import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { GroupNotFoundError } from '../../../domain/errors/group-not-found.error';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { DeleteGroupCommand } from './delete-group.command';

@CommandHandler(DeleteGroupCommand)
export class DeleteGroupHandler implements ICommandHandler<DeleteGroupCommand, void> {
  constructor(@Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository) {}

  async execute(command: DeleteGroupCommand): Promise<void> {
    const group = await this.groups.findById(GroupId.create(command.groupId));
    if (!group) {
      throw new GroupNotFoundError();
    }
    await this.groups.delete(group);
  }
}
