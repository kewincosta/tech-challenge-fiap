import { Vehicle } from '../../../src/modules/vehicles/domain/entities/vehicle';
import { VehicleRepository } from '../../../src/modules/vehicles/domain/repositories/vehicle.repository';
import { VehicleId } from '../../../src/modules/vehicles/domain/value-objects/vehicle-id';

export class InMemoryVehicleRepository implements VehicleRepository {
  vehicles: Vehicle[] = [];

  async findById(id: VehicleId): Promise<Vehicle | null> {
    return Promise.resolve(this.vehicles.find((vehicle) => vehicle.id.equals(id)) ?? null);
  }

  async save(vehicle: Vehicle): Promise<void> {
    this.vehicles = this.vehicles.filter((existing) => !existing.id.equals(vehicle.id));
    this.vehicles.push(vehicle);
    return Promise.resolve();
  }
}
