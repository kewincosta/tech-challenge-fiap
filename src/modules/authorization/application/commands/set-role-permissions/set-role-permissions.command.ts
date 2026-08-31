export class SetRolePermissionsCommand {
  constructor(
    readonly roleId: string,
    readonly permissions: string[],
  ) {}
}
