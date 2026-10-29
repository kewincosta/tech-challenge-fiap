import {
  CustomerAccounts,
  OpenedAccount,
} from '../../../src/modules/customers/application/ports/customer-accounts.port';

export interface RecordedAccount {
  email: string;
  name: string;
  document: string;
  /** Whether the transaction was open when the account was opened. */
  insideTransaction: boolean;
}

/** Holds seeded users and opens accounts like identity does: with the CUSTOMER role and a temporary password. */
export class FakeCustomerAccounts implements CustomerAccounts {
  private readonly holdsCustomerRole = new Map<string, boolean>();
  /** Every account opened, in order. */
  readonly opened: RecordedAccount[] = [];

  /**
   * `newAccount` is what the next `open` answers. `insideTransaction` tells whether the
   * transaction is open at that moment.
   */
  constructor(
    private readonly newAccount: { userId: string; temporaryPassword: string },
    private readonly insideTransaction: () => boolean = () => false,
  ) {}

  /** Seeds an existing user, with or without the CUSTOMER role. */
  withUser(userId: string, holdsCustomerRole: boolean): this {
    this.holdsCustomerRole.set(userId, holdsCustomerRole);
    return this;
  }

  async findUser(userId: string): Promise<{ id: string } | null> {
    return Promise.resolve(this.holdsCustomerRole.has(userId) ? { id: userId } : null);
  }

  async hasCustomerRole(userId: string): Promise<boolean> {
    return Promise.resolve(this.holdsCustomerRole.get(userId) ?? false);
  }

  async open(email: string, name: string, document: string): Promise<OpenedAccount> {
    this.opened.push({ email, name, document, insideTransaction: this.insideTransaction() });
    this.holdsCustomerRole.set(this.newAccount.userId, true);
    return Promise.resolve({ ...this.newAccount });
  }
}
