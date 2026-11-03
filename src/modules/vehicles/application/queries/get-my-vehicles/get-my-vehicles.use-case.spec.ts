import { describe, expect, it, vi } from 'vitest';
import { FakeVehicleOwners } from '../../../../../../test/support/fakes/fake-vehicle-owners';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetMyVehiclesUseCase } from './get-my-vehicles.use-case';
import { GetMyVehiclesQuery } from './get-my-vehicles.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

/** The user backs the customer `CUSTOMER_ID`, or backs none when `false`. */
function ownersWhere(userIsCustomer: boolean): FakeVehicleOwners {
  const owners = new FakeVehicleOwners();
  if (userIsCustomer) {
    owners.add({ id: CUSTOMER_ID, active: true }, USER_ID);
  }
  return owners;
}

function fakePort(result: VehicleSummaryDto[]): VehicleQueryPort {
  return {
    getById: vi.fn(),
    listByCustomerId: vi.fn().mockResolvedValue(result),
  };
}

describe('GetMyVehiclesUseCase', () => {
  it("resolves the customer through the vehicle owners, by the caller's user id", async () => {
    const port = fakePort([]);
    const owners = ownersWhere(true);
    const useCase = new GetMyVehiclesUseCase(port, owners);

    await useCase.execute(new GetMyVehiclesQuery(USER_ID));

    expect(owners.userLookups).toEqual([USER_ID]);
    expect(port.listByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('returns an empty list for a user backing no customer record, not an error', async () => {
    const port = fakePort([]);
    const useCase = new GetMyVehiclesUseCase(port, ownersWhere(false));

    const result = await useCase.execute(new GetMyVehiclesQuery(USER_ID));

    expect(result).toEqual([]);
    expect(port.listByCustomerId).not.toHaveBeenCalled();
  });

  it('returns exactly what the port answers for the resolved customer', async () => {
    const rows = [{ id: '33333333-3333-4333-8333-333333333333' } as VehicleSummaryDto];
    const port = fakePort(rows);
    const useCase = new GetMyVehiclesUseCase(port, ownersWhere(true));

    await expect(useCase.execute(new GetMyVehiclesQuery(USER_ID))).resolves.toBe(rows);
  });
});
