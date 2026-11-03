import { ServiceQueryPort, ServiceSummaryDto } from '../../ports/service-query.port';
import { ListServicesQuery } from './list-services.query';

export class ListServicesUseCase {
  constructor(private readonly serviceQuery: ServiceQueryPort) {}

  async execute(_query: ListServicesQuery): Promise<ServiceSummaryDto[]> {
    return this.serviceQuery.listActive();
  }
}
