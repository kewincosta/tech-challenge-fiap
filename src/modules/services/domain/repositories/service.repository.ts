import { Service } from '../entities/service';
import { ServiceId } from '../value-objects/service-id';
import { ServiceName } from '../value-objects/service-name';

export interface ServiceRepository {
  findById(id: ServiceId): Promise<Service | null>;
  /** Case-insensitive, active services only. `excludingId` lets a rename skip its own row. */
  existsActiveByName(name: ServiceName, excludingId?: ServiceId): Promise<boolean>;
  save(service: Service): Promise<void>;
}

export const SERVICE_REPOSITORY = Symbol('ServiceRepository');
