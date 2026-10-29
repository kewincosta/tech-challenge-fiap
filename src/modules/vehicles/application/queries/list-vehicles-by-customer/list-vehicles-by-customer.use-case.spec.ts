import { describe, expect, it, vi } from 'vitest';
import { VehicleQueryPort, VehicleSummaryDto } from '../../ports/vehicle-query.port';
import { ListVehiclesByCustomerUseCase } from './list-vehicles-by-customer.use-case';
import { ListVehiclesByCustomerQuery } from './list-vehicles-by-customer.query';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

function fakePort(result: VehicleSummaryDto[]): VehicleQueryPort {
  return {
    getById: vi.fn(),
    listByCustomerId: vi.fn().mockResolvedValue(result),
  };
}

describe('ListVehiclesByCustomerUseCase', () => {
  it("returns exactly what the port answers for the customer's id", async () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' } as VehicleSummaryDto];
    const port = fakePort(rows);
    const useCase = new ListVehiclesByCustomerUseCase(port);

    const result = await useCase.execute(new ListVehiclesByCustomerQuery(CUSTOMER_ID));

    expect(result).toBe(rows);
    expect(port.listByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('answers an empty list for a customer with no vehicles, never an error', async () => {
    const useCase = new ListVehiclesByCustomerUseCase(fakePort([]));

    await expect(useCase.execute(new ListVehiclesByCustomerQuery(CUSTOMER_ID))).resolves.toEqual(
      [],
    );
  });
});
