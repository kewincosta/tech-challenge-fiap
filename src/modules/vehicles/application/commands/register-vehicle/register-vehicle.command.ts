export class RegisterVehicleCommand {
  constructor(
    readonly customerId: string,
    readonly plate: string,
    readonly brand: string,
    readonly model: string,
    readonly year: number,
  ) {}
}

export interface RegisteredVehicleDto {
  id: string;
}
