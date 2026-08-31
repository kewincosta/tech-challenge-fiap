export class UpdateVehicleCommand {
  constructor(
    readonly vehicleId: string,
    readonly brand?: string,
    readonly model?: string,
    readonly year?: number,
    /** Transfers ownership to this customer's external id when supplied. */
    readonly customerId?: string,
  ) {}
}
