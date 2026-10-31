import { SessionRepository } from '../../../../authentication/application/ports/session.repository';
import { AccountInUseError } from '../../../domain/errors/account-in-use.error';
import { UserId } from '../../../domain/value-objects/user-id';
import { UserRepository } from '../../ports/user.repository';
import { DiscardOpenedAccountCommand } from './discard-opened-account.command';

/**
 * The compensation of an account another module opened: removes the user and its role assignments
 * so that the email and the document can register again. A user that does not exist is already
 * gone, so the call changes nothing. An account somebody has logged into, or that another module's
 * records point at, is in use and stays: the sessions are checked here, in identity's own tables,
 * and the repository turns the database's refusal into the same error for every other reference.
 */
export class DiscardOpenedAccountUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(command: DiscardOpenedAccountCommand): Promise<void> {
    if (await this.sessions.existsByUserId(command.userId)) {
      throw new AccountInUseError();
    }
    await this.users.delete(UserId.create(command.userId));
  }
}
