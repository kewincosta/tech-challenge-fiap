import { describe, expect, it } from 'vitest';
import {
  CustomerNotFoundError,
  CustomerSummaryDto,
  GetCustomerByUserIdHandler,
  GetCustomerByUserIdQuery,
  GetCustomerHandler,
  GetCustomerQuery,
} from '../../../customers';
import { VehicleOwnersGateway } from './vehicle-owners.gateway';

const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const ACTIVE_CUSTOMER: CustomerSummaryDto = {
  id: CUSTOMER_ID,
  userId: USER_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  document: '11144477735',
  address: null,
  phoneNumber: null,
  status: 'ACTIVE',
};

type Answer = CustomerSummaryDto | null | Error;

function answer(result: Answer): Promise<CustomerSummaryDto | null> {
  return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
}

// The gateway uses only `execute` of the customers module's handlers. Each stand-in answers for
// the one key it is asked about, so a gateway that sends the wrong identifier gets `null`.
function gatewayOver(byId: Answer, byUserId: Answer = null): VehicleOwnersGateway {
  const getCustomer = {
    execute: (query: GetCustomerQuery) => answer(query.customerId === CUSTOMER_ID ? byId : null),
  } as unknown as GetCustomerHandler;
  const getCustomerByUserId = {
    execute: (query: GetCustomerByUserIdQuery) =>
      answer(query.userId === USER_ID ? byUserId : null),
  } as unknown as GetCustomerByUserIdHandler;
  return new VehicleOwnersGateway(getCustomer, getCustomerByUserId);
}

describe('VehicleOwnersGateway', () => {
  describe('findById', () => {
    it('should map the customers module answer to the id and an active flag', async () => {
      const owners = gatewayOver(ACTIVE_CUSTOMER);

      const owner = await owners.findById(CUSTOMER_ID);

      expect(owner).toEqual({ id: CUSTOMER_ID, active: true });
    });

    it('should report a deactivated customer as found and not active', async () => {
      const owners = gatewayOver({ ...ACTIVE_CUSTOMER, status: 'INACTIVE' });

      const owner = await owners.findById(CUSTOMER_ID);

      expect(owner).toEqual({ id: CUSTOMER_ID, active: false });
    });

    it('should answer null when the customers module answers null', async () => {
      const owners = gatewayOver(null);

      expect(await owners.findById(CUSTOMER_ID)).toBeNull();
    });

    it('should answer null when the customers module throws its not-found error', async () => {
      const owners = gatewayOver(new CustomerNotFoundError());

      expect(await owners.findById(CUSTOMER_ID)).toBeNull();
    });

    it('should let any other error from the customers module through', async () => {
      const failure = new Error('database is down');
      const owners = gatewayOver(failure);

      await expect(owners.findById(CUSTOMER_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUserId', () => {
    it('should map the customer of a user to its id alone', async () => {
      const owners = gatewayOver(null, ACTIVE_CUSTOMER);

      const owner = await owners.findByUserId(USER_ID);

      expect(owner).toEqual({ id: CUSTOMER_ID });
    });

    it('should answer null when the customers module answers null', async () => {
      const owners = gatewayOver(ACTIVE_CUSTOMER, null);

      expect(await owners.findByUserId(USER_ID)).toBeNull();
    });

    it('should answer null when the customers module throws its not-found error', async () => {
      const owners = gatewayOver(ACTIVE_CUSTOMER, new CustomerNotFoundError());

      expect(await owners.findByUserId(USER_ID)).toBeNull();
    });

    it('should let any other error from the customers module through', async () => {
      const failure = new Error('database is down');
      const owners = gatewayOver(ACTIVE_CUSTOMER, failure);

      await expect(owners.findByUserId(USER_ID)).rejects.toBe(failure);
    });
  });
});
