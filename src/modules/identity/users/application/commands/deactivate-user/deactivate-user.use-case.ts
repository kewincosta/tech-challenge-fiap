import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { LogoutAllSessionsCommand } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.command';
import { LogoutAllSessionsUseCase } from '../../../../authentication/application/commands/logout-all-sessions/logout-all-sessions.use-case';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UserId } from '../../../domain/value-objects/user-id';
import { UserRepository } from '../../ports/user.repository';
import { DeactivateUserCommand } from './deactivate-user.command';

export class DeactivateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly logoutAllSessions: LogoutAllSessionsUseCase,
  ) {}

  async execute(command: DeactivateUserCommand): Promise<void> {
    const userId = UserId.create(command.userId);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    user.deactivate(this.clock.now());
    await this.users.save(user);
    this.events.publish(user.pullDomainEvents());
    // A deactivated account otherwise keeps any already-issued access token working until it
    // expires - JwtAuthGuard checks token/session validity on every request, never user status
    // (spec.md's own Edge Case; see validation.md's Fix 2).
    await this.logoutAllSessions.execute(new LogoutAllSessionsCommand(user.id.value));
  }
}
