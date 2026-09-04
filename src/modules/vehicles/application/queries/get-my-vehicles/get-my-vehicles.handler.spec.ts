import { describe, expect, it, vi } from 'vitest';
import { stubQueryBus } from '../../../../../../test/support/fakes/bus.stubs';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { GetMyVehiclesHandler } from './get-my-vehicles.handler';
import { GetMyVehiclesQuery } from './get-my-vehicles.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

function customer(): CustomerSummaryDto {
  return {
    id: CUSTOMER_ID,
    userId: USER_ID,
    name: 'Jane Doe',
    email: 'jane@example.com',
    document: '11144477735',
    address: null,
    phoneNumber: null,
    status: 'ACTIVE',
  };
}

function fakePort(result: VehicleSummaryDto[]): VehicleQueryPort {
  return {
    getById: vi.fn(),
    listByCustomerId: vi.fn().mockResolvedValue(result),
  };
}

describe('GetMyVehiclesHandler', () => {
  it("resolves the customer over the QueryBus, never by importing the customers module's repository", async () => {
    const port = fakePort([]);
    const queryBus = stubQueryBus();
    queryBus.execute.mockResolvedValue(customer());
    const handler = new GetMyVehiclesHandler(port, queryBus.bus);

    await handler.execute(new GetMyVehiclesQuery(USER_ID));

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetCustomerByUserIdQuery));
    expect(port.listByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('returns an empty list for a user backing no customer record, not an error', async () => {
    const port = fakePort([]);
    const queryBus = stubQueryBus();
    queryBus.execute.mockResolvedValue(null);
    const handler = new GetMyVehiclesHandler(port, queryBus.bus);

    const result = await handler.execute(new GetMyVehiclesQuery(USER_ID));

    expect(result).toEqual([]);
    expect(port.listByCustomerId).not.toHaveBeenCalled();
  });

  it('returns exactly what the port answers for the resolved customer', async () => {
    const rows = [{ id: '33333333-3333-4333-8333-333333333333' } as VehicleSummaryDto];
    const port = fakePort(rows);
    const queryBus = stubQueryBus();
    queryBus.execute.mockResolvedValue(customer());
    const handler = new GetMyVehiclesHandler(port, queryBus.bus);

    await expect(handler.execute(new GetMyVehiclesQuery(USER_ID))).resolves.toBe(rows);
  });
});
