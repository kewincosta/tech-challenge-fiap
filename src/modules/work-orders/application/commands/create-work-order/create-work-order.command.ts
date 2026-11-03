/** A part the customer asks for at reception: the catalog item and how many of it. */
export interface OpeningPartLine {
  readonly inventoryItemId: string;
  readonly quantity: number;
}

export class CreateWorkOrderCommand {
  constructor(
    readonly customerId: string,
    readonly vehicleId: string,
    readonly createdByUserId: string,
    /** Catalog services to open the work order with, one draft item each. */
    readonly serviceIds: readonly string[] = [],
    /** Parts to open the work order with, one draft item each. */
    readonly parts: readonly OpeningPartLine[] = [],
  ) {}
}

export interface CreatedWorkOrderDto {
  id: string;
  number: string;
}
