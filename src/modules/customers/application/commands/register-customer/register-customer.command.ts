export interface RegisterCustomerAddressInput {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export class RegisterCustomerCommand {
  constructor(
    /** External id of an existing user, mutually exclusive with email/name/document below. */
    readonly userId: string | undefined,
    readonly email: string | undefined,
    readonly name: string | undefined,
    readonly document: string | undefined,
    readonly address: RegisterCustomerAddressInput | undefined,
    readonly phoneNumber: string | undefined,
  ) {}
}

export interface RegisteredCustomerDto {
  id: string;
  /** Present only on the account-creation branch - shown once, never stored in plain form. */
  temporaryPassword?: string;
}
