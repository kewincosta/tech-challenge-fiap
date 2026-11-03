export class AuthenticateUserCommand {
  constructor(
    readonly email: string,
    readonly password: string,
    readonly ip: string | null,
    readonly userAgent: string | null,
  ) {}
}
