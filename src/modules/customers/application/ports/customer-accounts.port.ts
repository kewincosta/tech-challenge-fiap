/** A user account opened for a new customer. */
export interface OpenedAccount {
  userId: string;
  /** Shown once to the staff member who opened the account, never stored in plain form. */
  temporaryPassword?: string;
}

/**
 * What customer registration needs of the user accounts another module owns. A call that writes,
 * `open` and `discard`, commits in a transaction of identity's own, so a registration never holds a
 * transaction that writes accounts: it opens the account first and discards it again if the
 * customer cannot be saved. The reads, `findUser` and `hasCustomerRole`, run wherever the caller is.
 */
export interface CustomerAccounts {
  /** `null` when there is no such user. */
  findUser(userId: string): Promise<{ id: string } | null>;
  /** Whether the user holds the CUSTOMER role. */
  hasCustomerRole(userId: string): Promise<boolean>;
  /**
   * Opens an account for a customer, issued by staff: the CUSTOMER role and a temporary password.
   * The account takes `userId`, the id the caller chose, so the caller can name it before it exists.
   */
  open(userId: string, email: string, name: string, document: string): Promise<OpenedAccount>;
  /**
   * Removes an account opened by `open`, its role included, so the email and the document can
   * register again. Does nothing when no such user exists. Refuses with the identity module's error
   * when the account is in use: somebody logged into it, or a customer points at it.
   */
  discard(userId: string): Promise<void>;
}
