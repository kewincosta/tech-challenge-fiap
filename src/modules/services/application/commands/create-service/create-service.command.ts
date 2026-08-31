export class CreateServiceCommand {
  constructor(
    readonly name: string,
    readonly priceCents: number,
    readonly estimatedDurationMinutes: number,
    readonly description?: string | null,
  ) {}
}

export interface CreatedServiceDto {
  id: string;
}
