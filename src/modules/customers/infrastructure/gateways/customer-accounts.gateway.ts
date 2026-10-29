import { Injectable } from '@nestjs/common';
import {
  GetUserByIdHandler,
  GetUserByIdQuery,
  GetUserEffectiveAccessHandler,
  GetUserEffectiveAccessQuery,
  RegisterUserCommand,
  RegisterUserHandler,
  SystemRole,
} from '../../../identity';
import { CustomerAccounts, OpenedAccount } from '../../application/ports/customer-accounts.port';

/**
 * Reaches the user accounts through the public API of the identity module (AD-012). The calls run
 * on the caller's async context, so the account it opens joins the registration's transaction.
 */
@Injectable()
export class CustomerAccountsGateway implements CustomerAccounts {
  constructor(
    private readonly getUserById: GetUserByIdHandler,
    private readonly getUserEffectiveAccess: GetUserEffectiveAccessHandler,
    private readonly registerUser: RegisterUserHandler,
  ) {}

  async findUser(userId: string): Promise<{ id: string } | null> {
    const user = await this.getUserById.execute(new GetUserByIdQuery(userId));
    return user ? { id: user.id } : null;
  }

  async hasCustomerRole(userId: string): Promise<boolean> {
    const access = await this.getUserEffectiveAccess.execute(
      new GetUserEffectiveAccessQuery(userId),
    );
    return access.roles.includes(SystemRole.Customer);
  }

  // No password: the account is issued by staff, so identity generates a temporary one.
  async open(email: string, name: string, document: string): Promise<OpenedAccount> {
    const account = await this.registerUser.execute(
      new RegisterUserCommand(email, name, undefined, document, true),
    );
    return { userId: account.id, temporaryPassword: account.temporaryPassword };
  }
}
