export class UpdateGroupCommand {
  constructor(
    readonly groupId: string,
    readonly name: string | undefined,
    readonly description: string | null | undefined,
  ) {}
}
