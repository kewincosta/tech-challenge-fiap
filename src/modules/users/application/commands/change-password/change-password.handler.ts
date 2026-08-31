import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { LogoutAllSessionsCommand } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.command';
import { InvalidCredentialsError } from '../../../../authentication/domain/errors/invalid-credentials.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { Password } from '../../../domain/value-objects/password';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { UserId } from '../../../domain/value-objects/user-id';
import { PASSWORD_HASHER, PasswordHasher } from '../../ports/password-hasher.port';
import { ChangePasswordCommand } from './change-password.command';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findById(UserId.create(command.userId));
    if (!user) {
      throw new UserNotFoundError();
    }
    const currentMatches = await this.passwordHasher.verify(
      user.passwordHash.value,
      command.currentPassword,
    );
    if (!currentMatches) {
      throw new InvalidCredentialsError();
    }
    const newPassword = Password.create(command.newPassword);
    const newHash = PasswordHash.create(await this.passwordHasher.hash(newPassword.value));
    user.changePassword(newHash, this.clock.now());
    await this.users.save(user);
    // Revokes every session, including the one making this request - a stale access token issued
    // before the change still carries the old must-change-password claim (T16), and forcing a
    // fresh login is the only way to make a new token reflect the cleared flag.
    await this.commandBus.execute(new LogoutAllSessionsCommand(user.id.value));
  }
}
