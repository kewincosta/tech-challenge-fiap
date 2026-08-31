export class RevokeRoleFromUserCommand {
  constructor(
    readonly userId: string,
    readonly roleId: string,
  ) {}
}
