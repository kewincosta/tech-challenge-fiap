/** What vehicles read of a customer: who it is, and whether it can still own vehicles. */
export interface OwnerRef {
  id: string;
  active: boolean;
}

export interface VehicleOwners {
  /** A deactivated customer is still found, with `active` false. `null` when there is none. */
  findById(customerId: string): Promise<OwnerRef | null>;
  /** The customer record of a user account, `null` for a user who is not a customer. */
  findByUserId(userId: string): Promise<{ id: string } | null>;
}
