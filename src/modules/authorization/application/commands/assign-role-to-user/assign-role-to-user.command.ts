export interface RoleReference {
  id?: string;
  name?: string;
}

export class AssignRoleToUserCommand {
  constructor(
    readonly userId: string,
    readonly role: RoleReference,
  ) {}
}
