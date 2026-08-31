export class SetGroupPermissionsCommand {
  constructor(
    readonly groupId: string,
    readonly permissions: string[],
  ) {}
}
