import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { AssignRoleToUserCommand } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.command';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { User } from '../../../domain/entities/user';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { Password } from '../../../domain/value-objects/password';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { UserId } from '../../../domain/value-objects/user-id';
import { PASSWORD_HASHER, PasswordHasher } from '../../ports/password-hasher.port';
import { RegisteredUserDto, RegisterUserCommand } from './register-user.command';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand, RegisteredUserDto> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisteredUserDto> {
    const email = Email.create(command.email);
    const password = Password.create(command.password);
    if (await this.users.existsByEmail(email)) {
      throw new EmailAlreadyInUseError();
    }
    const passwordHash = PasswordHash.create(await this.passwordHasher.hash(password.value));
    const user = User.register({
      id: UserId.create(this.idGenerator.generate()),
      email,
      name: command.name,
      passwordHash,
      now: this.clock.now(),
    });
    await this.users.save(user);
    await this.commandBus.execute(
      new AssignRoleToUserCommand(user.id.value, { name: SystemRole.Customer }),
    );
    this.eventBus.publishAll(user.pullDomainEvents());
    return { id: user.id.value };
  }
}
