import { Injectable } from '@nestjs/common';
import {
  CustomerNotFoundError,
  GetCustomerByUserIdHandler,
  GetCustomerByUserIdQuery,
  GetCustomerHandler,
  GetCustomerQuery,
} from '../../../customers';
import { OwnerRef, VehicleOwners } from '../../application/ports/vehicle-owners.port';

const ACTIVE_STATUS = 'ACTIVE';

/**
 * Reads customers through the public API of the customers module. That module may answer a
 * missing customer with `null` or with its not-found error, and either way the caller gets
 * `null`, so each use case keeps raising its own error for the case (AD-012).
 */
@Injectable()
export class VehicleOwnersGateway implements VehicleOwners {
  constructor(
    private readonly getCustomer: GetCustomerHandler,
    private readonly getCustomerByUserId: GetCustomerByUserIdHandler,
  ) {}

  async findById(customerId: string): Promise<OwnerRef | null> {
    try {
      const customer = await this.getCustomer.execute(new GetCustomerQuery(customerId));
      return customer ? { id: customer.id, active: customer.status === ACTIVE_STATUS } : null;
    } catch (error) {
      if (error instanceof CustomerNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<{ id: string } | null> {
    try {
      const customer = await this.getCustomerByUserId.execute(new GetCustomerByUserIdQuery(userId));
      return customer ? { id: customer.id } : null;
    } catch (error) {
      if (error instanceof CustomerNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
