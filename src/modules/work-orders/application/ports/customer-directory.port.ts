/** What work orders read of a customer: who it is, and whether it can still open work orders. */
export interface CustomerRef {
  id: string;
  name: string;
  active: boolean;
}

export interface CustomerDirectory {
  /** A deactivated customer is still found, with `active` false. `null` when there is none. */
  findById(customerId: string): Promise<CustomerRef | null>;
  /** The customer record of a user account, `null` for a user who is not a customer. */
  findByUserId(userId: string): Promise<{ id: string } | null>;
}
