export class VerifyCredentialsQuery {
  constructor(
    readonly email: string,
    readonly password: string,
  ) {}
}

export interface VerifiedCredentialsDto {
  userId: string;
}
