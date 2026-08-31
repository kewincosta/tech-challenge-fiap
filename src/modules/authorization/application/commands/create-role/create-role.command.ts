export class CreateRoleCommand {
  constructor(
    readonly name: string,
    readonly description: string | null,
    readonly permissions: string[],
  ) {}
}

export interface CreatedRoleDto {
  id: string;
}
