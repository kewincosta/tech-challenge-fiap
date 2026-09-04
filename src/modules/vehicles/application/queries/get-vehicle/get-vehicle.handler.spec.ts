import { describe, expect, it, vi } from 'vitest';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetVehicleHandler } from './get-vehicle.handler';
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

describe('GetVehicleHandler', () => {
  it('returns what the port answers for a well formed id', async () => {
    const port = fakePort(vehicle());
    const handler = new GetVehicleHandler(port);

    const result = await handler.execute(new GetVehicleQuery(VEHICLE_ID));

    expect(result).toEqual(vehicle());
    expect(port.getById).toHaveBeenCalledWith(VEHICLE_ID);
  });

  it('returns null for an id the port knows nothing about', async () => {
    const handler = new GetVehicleHandler(fakePort(null));

    await expect(handler.execute(new GetVehicleQuery(VEHICLE_ID))).resolves.toBeNull();
  });

  it('returns null for a malformed id without touching the port', async () => {
    const port = fakePort(vehicle());
    const handler = new GetVehicleHandler(port);

    await expect(handler.execute(new GetVehicleQuery('not-a-uuid'))).resolves.toBeNull();
    expect(port.getById).not.toHaveBeenCalled();
  });
});
