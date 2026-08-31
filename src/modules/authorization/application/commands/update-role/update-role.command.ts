export class UpdateRoleCommand {
  constructor(
    readonly roleId: string,
    readonly name: string | undefined,
    readonly description: string | null | undefined,
  ) {}
}
