import { Injectable } from '@nestjs/common';
import { GetVehicleHandler, GetVehicleQuery, VehicleNotFoundError } from '../../../vehicles';
import { VehicleDirectory, VehicleRef } from '../../application/ports/vehicle-directory.port';

/**
 * Reads vehicles through the public API of the vehicles module. A missing vehicle is `null`
 * whether that module answers with `null` or with its not-found error (AD-012).
 */
@Injectable()
export class VehicleDirectoryGateway implements VehicleDirectory {
  constructor(private readonly getVehicle: GetVehicleHandler) {}

  async findById(vehicleId: string): Promise<VehicleRef | null> {
    try {
      const vehicle = await this.getVehicle.execute(new GetVehicleQuery(vehicleId));
      return vehicle
        ? {
            id: vehicle.id,
            customerId: vehicle.customerId,
            plate: vehicle.plate,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
          }
        : null;
    } catch (error) {
      if (error instanceof VehicleNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
