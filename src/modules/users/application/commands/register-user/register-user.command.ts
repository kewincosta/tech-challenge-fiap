export class RegisterUserCommand {
  constructor(
    readonly email: string,
    readonly name: string,
    readonly password: string,
    readonly document: string,
  ) {}
}

export interface RegisteredUserDto {
  id: string;
}
