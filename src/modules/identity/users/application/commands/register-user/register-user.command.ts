export class RegisterUserCommand {
  constructor(
    readonly email: string,
    readonly name: string,
    /** Omitted when `issuedByStaff` is true - the handler generates one instead (IDENT-07). */
    readonly password: string | undefined,
    readonly document: string,
    /** True for the staff-creation route: the caller supplies no password, one is generated,
     *  the account is flagged pending, and it comes back once in `RegisteredUserDto.temporaryPassword`. */
    readonly issuedByStaff: boolean = false,
  ) {}
}

export interface RegisteredUserDto {
  id: string;
  /** Present only when the command was `issuedByStaff` - shown once, never stored in plain form. */
  temporaryPassword?: string;
}
