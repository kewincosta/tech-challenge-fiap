import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { GroupNameAlreadyInUseError } from '../../../domain/errors/group-name-already-in-use.error';
import { GroupNotFoundError } from '../../../domain/errors/group-not-found.error';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { GroupName } from '../../../domain/value-objects/group-name';
import { UpdateGroupCommand } from './update-group.command';

@CommandHandler(UpdateGroupCommand)
export class UpdateGroupHandler implements ICommandHandler<UpdateGroupCommand, void> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateGroupCommand): Promise<void> {
    const group = await this.groups.findById(GroupId.create(command.groupId));
    if (!group) {
      throw new GroupNotFoundError();
    }
    let name: GroupName | undefined;
    if (command.name !== undefined) {
      name = GroupName.create(command.name);
      if (!name.equals(group.name) && (await this.groups.existsByName(name))) {
        throw new GroupNameAlreadyInUseError();
      }
    }
    group.update({ name, description: command.description }, this.clock.now());
    await this.groups.save(group);
  }
}
