import { Service } from '../../../src/modules/services/domain/entities/service';
import { ServiceRepository } from '../../../src/modules/services/domain/repositories/service.repository';
import { ServiceStatus } from '../../../src/modules/services/domain/service-status';
import { ServiceId } from '../../../src/modules/services/domain/value-objects/service-id';
import { ServiceName } from '../../../src/modules/services/domain/value-objects/service-name';

export class InMemoryServiceRepository implements ServiceRepository {
  services: Service[] = [];

  async findById(id: ServiceId): Promise<Service | null> {
    return Promise.resolve(this.services.find((service) => service.id.equals(id)) ?? null);
  }

  async existsActiveByName(name: ServiceName, excludingId?: ServiceId): Promise<boolean> {
    return Promise.resolve(
      this.services.some(
        (service) =>
          service.name.value.toLowerCase() === name.value.toLowerCase() &&
          service.status === ServiceStatus.Active &&
          !(excludingId && service.id.equals(excludingId)),
      ),
    );
  }

  async save(service: Service): Promise<void> {
    this.services = this.services.filter((existing) => !existing.id.equals(service.id));
    this.services.push(service);
    return Promise.resolve();
  }
}
