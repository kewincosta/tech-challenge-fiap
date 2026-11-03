import {
  CustomerAccounts,
  OpenedAccount,
} from '../../../src/modules/customers/application/ports/customer-accounts.port';

export interface RecordedAccount {
  /** The id the caller chose for the account. */
  userId: string;
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
  /** The id of every account discarded, in order. */
  readonly discarded: string[] = [];
  private openRefusal: Error | null = null;
  private discardRefusal: Error | null = null;

  /**
   * `newAccount` is what the next `open` answers. `insideTransaction` tells whether the
   * transaction is open at that moment.
   */
  constructor(
    private readonly newAccount: { userId: string; temporaryPassword: string },
    private readonly insideTransaction: () => boolean = () => false,
  ) {}

  /** Makes every later `open` reject with `error` and record nothing. */
  refuseOpenWith(error: Error): this {
    this.openRefusal = error;
    return this;
  }

  /** Makes every later `discard` reject with `error` and record nothing. */
  refuseDiscardWith(error: Error): this {
    this.discardRefusal = error;
    return this;
  }

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

  async open(
    userId: string,
    email: string,
    name: string,
    document: string,
  ): Promise<OpenedAccount> {
    if (this.openRefusal) {
      return Promise.reject(this.openRefusal);
    }
    this.opened.push({
      userId,
      email,
      name,
      document,
      insideTransaction: this.insideTransaction(),
    });
    this.holdsCustomerRole.set(this.newAccount.userId, true);
    return Promise.resolve({ ...this.newAccount });
  }

  async discard(userId: string): Promise<void> {
    if (this.discardRefusal) {
      return Promise.reject(this.discardRefusal);
    }
    this.discarded.push(userId);
    this.holdsCustomerRole.delete(userId);
    return Promise.resolve();
  }
}
