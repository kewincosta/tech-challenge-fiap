import { Vehicle } from '../entities/vehicle';
import { VehicleId } from '../value-objects/vehicle-id';

export interface VehicleRepository {
  findById(id: VehicleId): Promise<Vehicle | null>;
  save(vehicle: Vehicle): Promise<void>;
}

export const VEHICLE_REPOSITORY = Symbol('VehicleRepository');
