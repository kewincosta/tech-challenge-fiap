export class CreateWorkOrderCommand {
  constructor(
    readonly customerId: string,
    readonly vehicleId: string,
    readonly createdByUserId: string,
  ) {}
}

export interface CreatedWorkOrderDto {
  id: string;
  number: string;
}
