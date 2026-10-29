import { Injectable } from '@nestjs/common';
import { GetServiceHandler, GetServiceQuery, ServiceNotFoundError } from '../../../services';
import { ServiceCatalog, ServiceRef } from '../../application/ports/service-catalog.port';

const ACTIVE_STATUS = 'ACTIVE';

/**
 * Reads services through the public API of the services module. A missing service is `null`
 * whether that module answers with `null` or with its not-found error (AD-012).
 */
@Injectable()
export class ServiceCatalogGateway implements ServiceCatalog {
  constructor(private readonly getService: GetServiceHandler) {}

  async findById(serviceId: string): Promise<ServiceRef | null> {
    try {
      const service = await this.getService.execute(new GetServiceQuery(serviceId));
      return service
        ? {
            id: service.id,
            name: service.name,
            priceCents: service.priceCents,
            active: service.status === ACTIVE_STATUS,
          }
        : null;
    } catch (error) {
      if (error instanceof ServiceNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
