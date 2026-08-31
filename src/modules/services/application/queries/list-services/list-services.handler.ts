import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  SERVICE_QUERY_PORT,
  ServiceQueryPort,
  ServiceSummaryDto,
} from '../../ports/service-query.port';
import { ListServicesQuery } from './list-services.query';

@QueryHandler(ListServicesQuery)
export class ListServicesHandler implements IQueryHandler<ListServicesQuery, ServiceSummaryDto[]> {
  constructor(@Inject(SERVICE_QUERY_PORT) private readonly serviceQuery: ServiceQueryPort) {}

  async execute(): Promise<ServiceSummaryDto[]> {
    return this.serviceQuery.listActive();
  }
}
