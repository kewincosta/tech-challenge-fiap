import { Vehicle } from '../../domain/entities/vehicle';
import { LicensePlate } from '../../domain/value-objects/license-plate';
import { VehicleId } from '../../domain/value-objects/vehicle-id';
import { VehicleYear } from '../../domain/value-objects/vehicle-year';
import { VehicleOrmEntity } from './vehicle.orm-entity';

export class VehicleMapper {
  static toDomain(row: VehicleOrmEntity, customerExternalId: string): Vehicle {
    return Vehicle.restore({
      id: VehicleId.create(row.externalId),
      customerId: customerExternalId,
      plate: LicensePlate.create(row.plate),
      brand: row.brand,
      model: row.model,
      // Re-validating against today's year on read is safe: the upper bound (currentYear + 1)
      // only relaxes as time moves forward, so a row that was valid when written can never later
      // fail this check purely because time passed - the same "re-validate on read" style
      // UserMapper already applies to Email/PersonDocument/PasswordHash.
      year: VehicleYear.create(row.year, new Date().getFullYear()),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  static toOrm(vehicle: Vehicle): VehicleOrmEntity {
    const row = new VehicleOrmEntity();
    row.externalId = vehicle.id.value;
    row.plate = vehicle.plate.value;
    row.brand = vehicle.brand;
    row.model = vehicle.model;
    row.year = vehicle.year.value;
    row.createdAt = vehicle.createdAt;
    row.updatedAt = vehicle.updatedAt;
    row.deletedAt = vehicle.deletedAt;
    return row;
  }
}
