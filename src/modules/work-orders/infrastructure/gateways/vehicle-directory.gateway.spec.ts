import { describe, expect, it } from 'vitest';
import {
  GetVehicleUseCase,
  GetVehicleQuery,
  VehicleNotFoundError,
  VehicleSummaryDto,
} from '../../../vehicles';
import { VehicleDirectoryGateway } from './vehicle-directory.gateway';

const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

const VEHICLE: VehicleSummaryDto = {
  id: VEHICLE_ID,
  customerId: CUSTOMER_ID,
  plate: 'ABC1234',
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
};

// The gateway uses only `execute` of the vehicles module's use case. The stand-in answers for the
// one id it is asked about, so a gateway that sends the wrong identifier gets `null`.
function gatewayOver(result: VehicleSummaryDto | null | Error): VehicleDirectoryGateway {
  const getVehicle = {
    execute: (query: GetVehicleQuery) => {
      if (query.vehicleId !== VEHICLE_ID) {
        return Promise.resolve(null);
      }
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  } as unknown as GetVehicleUseCase;
  return new VehicleDirectoryGateway(getVehicle);
}

describe('VehicleDirectoryGateway', () => {
  it('should map the vehicles module answer to the vehicle, its owner and its description', async () => {
    const directory = gatewayOver(VEHICLE);

    const vehicle = await directory.findById(VEHICLE_ID);

    expect(vehicle).toEqual({
      id: VEHICLE_ID,
      customerId: CUSTOMER_ID,
      plate: 'ABC1234',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
    });
  });

  it('should answer null when the vehicles module answers null', async () => {
    const directory = gatewayOver(null);

    expect(await directory.findById(VEHICLE_ID)).toBeNull();
  });

  it('should answer null when the vehicles module throws its not-found error', async () => {
    const directory = gatewayOver(new VehicleNotFoundError());

    expect(await directory.findById(VEHICLE_ID)).toBeNull();
  });

  it('should let any other error from the vehicles module through', async () => {
    const failure = new Error('database is down');
    const directory = gatewayOver(failure);

    await expect(directory.findById(VEHICLE_ID)).rejects.toBe(failure);
  });
});
