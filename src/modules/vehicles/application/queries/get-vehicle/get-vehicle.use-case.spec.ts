import { describe, expect, it, vi } from 'vitest';
import { VehicleNotFoundError } from '../../../domain/errors/vehicle-not-found.error';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetVehicleUseCase } from './get-vehicle.use-case';
import { GetVehicleQuery } from './get-vehicle.query';

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';

function vehicle(): VehicleSummaryDto {
  return {
    id: VEHICLE_ID,
    customerId: '22222222-2222-4222-8222-222222222222',
    plate: 'ABC1234',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
  };
}

function fakePort(result: VehicleSummaryDto | null): VehicleQueryPort {
  return {
    getById: vi.fn().mockResolvedValue(result),
    listByCustomerId: vi.fn(),
  };
}

describe('GetVehicleUseCase', () => {
  it('returns what the port answers for a well formed id', async () => {
    const port = fakePort(vehicle());
    const useCase = new GetVehicleUseCase(port);

    const result = await useCase.execute(new GetVehicleQuery(VEHICLE_ID));

    expect(result).toEqual(vehicle());
    expect(port.getById).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it('refuses an id the port knows nothing about with the vehicle not-found error', async () => {
    const useCase = new GetVehicleUseCase(fakePort(null));

    await expect(useCase.execute(new GetVehicleQuery(VEHICLE_ID))).rejects.toThrow(
      VehicleNotFoundError,
    );
  });

  it('refuses a malformed id with the vehicle not-found error without touching the port', async () => {
    const port = fakePort(vehicle());
    const useCase = new GetVehicleUseCase(port);

    await expect(useCase.execute(new GetVehicleQuery('not-a-uuid'))).rejects.toThrow(
      VehicleNotFoundError,
    );
    expect(port.getById).not.toHaveBeenCalled();
  });
});
