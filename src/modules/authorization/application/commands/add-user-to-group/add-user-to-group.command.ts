export class AddUserToGroupCommand {
  constructor(
    readonly userId: string,
    readonly groupId: string,
  ) {}
}
