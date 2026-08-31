export class SetGroupRolesCommand {
  constructor(
    readonly groupId: string,
    readonly roleIds: string[],
  ) {}
}
