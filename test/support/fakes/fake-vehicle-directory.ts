import {
  VehicleDirectory,
  VehicleRef,
} from '../../../src/modules/work-orders/application/ports/vehicle-directory.port';

export class FakeVehicleDirectory implements VehicleDirectory {
  private readonly vehicles = new Map<string, VehicleRef>();

  add(vehicle: VehicleRef): this {
    this.vehicles.set(vehicle.id, vehicle);
    return this;
  }

  async findById(vehicleId: string): Promise<VehicleRef | null> {
    return Promise.resolve(this.vehicles.get(vehicleId) ?? null);
  }
}
