/** What work orders read of a vehicle: its owner and the description a work order snapshots. */
export interface VehicleRef {
  id: string;
  customerId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

export interface VehicleDirectory {
  /** `null` when there is no such vehicle. */
  findById(vehicleId: string): Promise<VehicleRef | null>;
}
