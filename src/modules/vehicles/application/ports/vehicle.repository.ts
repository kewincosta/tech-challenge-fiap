import { Vehicle } from '../../domain/entities/vehicle';
import { VehicleId } from '../../domain/value-objects/vehicle-id';

export interface VehicleRepository {
  findById(id: VehicleId): Promise<Vehicle | null>;
  save(vehicle: Vehicle): Promise<void>;
}
