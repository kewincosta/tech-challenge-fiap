import {
  ServiceCatalog,
  ServiceRef,
} from '../../../src/modules/work-orders/application/ports/service-catalog.port';

export class FakeServiceCatalog implements ServiceCatalog {
  private readonly services = new Map<string, ServiceRef>();

  add(service: ServiceRef): this {
    this.services.set(service.id, service);
    return this;
  }

  async findById(serviceId: string): Promise<ServiceRef | null> {
    return Promise.resolve(this.services.get(serviceId) ?? null);
  }
}
