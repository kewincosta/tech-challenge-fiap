import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceQueryPort, ServiceSummaryDto } from '../../ports/service-query.port';
import { GetServiceQuery } from './get-service.query';

/**
 * The cross-module contract feature 5 will call. Returns the service whatever its status, so that
 * "does not exist" (the not-found error) stays distinct from "exists but deactivated" (status)
 * and rule 18 can be refused precisely.
 */
export class GetServiceUseCase {
  constructor(private readonly serviceQuery: ServiceQueryPort) {}

  async execute(query: GetServiceQuery): Promise<ServiceSummaryDto> {
    try {
      ServiceId.create(query.serviceId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it -
      // same guard GetCustomerUseCase uses.
      throw new ServiceNotFoundError();
    }
    const service = await this.serviceQuery.getById(query.serviceId);
    if (!service) {
      throw new ServiceNotFoundError();
    }
    return service;
  }
}
