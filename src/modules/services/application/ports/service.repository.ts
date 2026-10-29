import { Service } from '../../domain/entities/service';
import { ServiceId } from '../../domain/value-objects/service-id';
import { ServiceName } from '../../domain/value-objects/service-name';

export interface ServiceRepository {
  findById(id: ServiceId): Promise<Service | null>;
  /** Case-insensitive, active services only. `excludingId` lets a rename skip its own row. */
  existsActiveByName(name: ServiceName, excludingId?: ServiceId): Promise<boolean>;
  save(service: Service): Promise<void>;
}
