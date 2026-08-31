import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { Group } from '../../../domain/entities/group';
import { GroupNameAlreadyInUseError } from '../../../domain/errors/group-name-already-in-use.error';
import { GROUP_REPOSITORY, GroupRepository } from '../../../domain/repositories/group.repository';
import { GroupId } from '../../../domain/value-objects/group-id';
import { GroupName } from '../../../domain/value-objects/group-name';
import { CreatedGroupDto, CreateGroupCommand } from './create-group.command';

@CommandHandler(CreateGroupCommand)
export class CreateGroupHandler implements ICommandHandler<CreateGroupCommand, CreatedGroupDto> {
  constructor(
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateGroupCommand): Promise<CreatedGroupDto> {
    const name = GroupName.create(command.name);
    if (await this.groups.existsByName(name)) {
      throw new GroupNameAlreadyInUseError();
    }
    const group = Group.create({
      id: GroupId.create(this.idGenerator.generate()),
      name,
      description: command.description,
      now: this.clock.now(),
    });
    await this.groups.save(group);
    return { id: group.id.value };
  }
}
