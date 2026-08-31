export interface RoleReference {
  id?: string;
  name?: string;
}

export class AssignRoleToUserCommand {
  constructor(
    readonly userId: string,
    readonly role: RoleReference,
    // Undefined for a system-initiated assignment (self-registration's default CUSTOMER role,
    // which never triggers the escalation rule below). An HTTP-initiated assignment supplies the
    // caller's id so AssignRoleToUserHandler can check it against the target role.
    readonly actorUserId?: string,
  ) {}
}
