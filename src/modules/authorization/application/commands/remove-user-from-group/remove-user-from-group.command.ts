export class RemoveUserFromGroupCommand {
  constructor(
    readonly userId: string,
    readonly groupId: string,
  ) {}
}
