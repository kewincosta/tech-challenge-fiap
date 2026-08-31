export class CreateGroupCommand {
  constructor(
    readonly name: string,
    readonly description: string | null,
  ) {}
}

export interface CreatedGroupDto {
  id: string;
}
