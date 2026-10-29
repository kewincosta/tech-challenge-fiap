/** A user account opened for a new customer. */
export interface OpenedAccount {
  userId: string;
  /** Shown once to the staff member who opened the account, never stored in plain form. */
  temporaryPassword?: string;
}

/**
 * What customer registration needs of the user accounts another module owns. Every call runs
 * inside the caller's transaction, so an account opened here is rolled back with the customer.
 */
export interface CustomerAccounts {
  /** `null` when there is no such user. */
  findUser(userId: string): Promise<{ id: string } | null>;
  /** Whether the user holds the CUSTOMER role. */
  hasCustomerRole(userId: string): Promise<boolean>;
  /** Opens an account for a customer, issued by staff: the CUSTOMER role and a temporary password. */
  open(email: string, name: string, document: string): Promise<OpenedAccount>;
}
