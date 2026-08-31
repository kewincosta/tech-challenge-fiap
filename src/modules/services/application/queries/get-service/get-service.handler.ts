import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ServiceId } from '../../../domain/value-objects/service-id';
import {
  SERVICE_QUERY_PORT,
  ServiceQueryPort,
  ServiceSummaryDto,
} from '../../ports/service-query.port';
import { GetServiceQuery } from './get-service.query';

/**
 * The cross-module contract feature 5 will call. Returns the service whatever its status, so that
 * "does not exist" (null) stays distinct from "exists but deactivated" (status) and rule 18 can be
 * refused precisely.
 */
@QueryHandler(GetServiceQuery)
export class GetServiceHandler implements IQueryHandler<GetServiceQuery, ServiceSummaryDto | null> {
  constructor(@Inject(SERVICE_QUERY_PORT) private readonly serviceQuery: ServiceQueryPort) {}

  async execute(query: GetServiceQuery): Promise<ServiceSummaryDto | null> {
    try {
      ServiceId.create(query.serviceId);
    } catch {
      // A malformed id matches nothing by construction, and a uuid column would throw on it -
      // same guard GetCustomerHandler uses.
      return null;
    }
    return this.serviceQuery.getById(query.serviceId);
  }
}
