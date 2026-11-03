import { Injectable } from '@nestjs/common';
import {
  DiscardOpenedAccountCommand,
  DiscardOpenedAccountUseCase,
  GetUserByIdUseCase,
  GetUserByIdQuery,
  GetUserEffectiveAccessUseCase,
  GetUserEffectiveAccessQuery,
  RegisterUserCommand,
  RegisterUserUseCase,
  SystemRole,
  UserNotFoundError,
} from '../../../identity';
import { CustomerAccounts, OpenedAccount } from '../../application/ports/customer-accounts.port';

/**
 * Reaches the user accounts through the public API of the identity module (AD-012). `open` and
 * `discard` call identity's use cases, which commit in a transaction of their own, so the
 * registration opens the account before its customers transaction and discards it if that fails.
 */
@Injectable()
export class CustomerAccountsGateway implements CustomerAccounts {
  constructor(
    private readonly getUserById: GetUserByIdUseCase,
    private readonly getUserEffectiveAccess: GetUserEffectiveAccessUseCase,
    private readonly registerUser: RegisterUserUseCase,
    private readonly discardOpenedAccount: DiscardOpenedAccountUseCase,
  ) {}

  async findUser(userId: string): Promise<{ id: string } | null> {
    try {
      const user = await this.getUserById.execute(new GetUserByIdQuery(userId));
      return { id: user.id };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async hasCustomerRole(userId: string): Promise<boolean> {
    const access = await this.getUserEffectiveAccess.execute(
      new GetUserEffectiveAccessQuery(userId),
    );
    return access.roles.includes(SystemRole.Customer);
  }

  // No password: the account is issued by staff, so identity generates a temporary one.
  async open(
    userId: string,
    email: string,
    name: string,
    document: string,
  ): Promise<OpenedAccount> {
    const account = await this.registerUser.execute(
      new RegisterUserCommand(email, name, undefined, document, true, userId),
    );
    return { userId: account.id, temporaryPassword: account.temporaryPassword };
  }

  async discard(userId: string): Promise<void> {
    await this.discardOpenedAccount.execute(new DiscardOpenedAccountCommand(userId));
  }
}
