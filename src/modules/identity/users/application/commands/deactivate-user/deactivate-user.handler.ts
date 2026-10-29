import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK } from '../../../../../../shared/shared.tokens';
import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { LogoutAllSessionsCommand } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.command';
import { LogoutAllSessionsHandler } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.handler';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id';
import { DeactivateUserCommand } from './deactivate-user.command';

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler implements ICommandHandler<DeactivateUserCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
    private readonly logoutAllSessions: LogoutAllSessionsHandler,
  ) {}

  async execute(command: DeactivateUserCommand): Promise<void> {
    const userId = UserId.create(command.userId);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    user.deactivate(this.clock.now());
    await this.users.save(user);
    this.eventBus.publishAll(user.pullDomainEvents());
    // A deactivated account otherwise keeps any already-issued access token working until it
    // expires - JwtAuthGuard checks token/session validity on every request, never user status
    // (spec.md's own Edge Case; see validation.md's Fix 2).
    await this.logoutAllSessions.execute(new LogoutAllSessionsCommand(user.id.value));
  }
}
