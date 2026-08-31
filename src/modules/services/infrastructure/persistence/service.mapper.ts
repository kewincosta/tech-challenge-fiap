import { Money } from '../../../../shared/domain/value-objects/money';
import { Service } from '../../domain/entities/service';
import { ServiceStatus } from '../../domain/service-status';
import { ServiceDuration } from '../../domain/value-objects/service-duration';
import { ServiceId } from '../../domain/value-objects/service-id';
import { ServiceName } from '../../domain/value-objects/service-name';
import { ServiceOrmEntity } from './service.orm-entity';

export class ServiceMapper {
  static toDomain(row: ServiceOrmEntity): Service {
    return Service.restore({
      id: ServiceId.create(row.externalId),
      name: ServiceName.create(row.name),
      description: row.description,
      // The explicit conversion AD-002 requires: the driver returns a bigint column as a string,
      // so reading it as a number without this would silently produce "15099" instead of 15099.
      price: Money.fromDatabase(row.priceCents),
      duration: ServiceDuration.fromMinutes(row.estimatedDurationMinutes),
      status: row.status as ServiceStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toOrm(service: Service): ServiceOrmEntity {
    const row = new ServiceOrmEntity();
    row.externalId = service.id.value;
    row.name = service.name.value;
    row.description = service.description;
    row.priceCents = String(service.price.cents);
    row.estimatedDurationMinutes = service.duration.minutes;
    row.status = service.status;
    row.createdAt = service.createdAt;
    row.updatedAt = service.updatedAt;
    return row;
  }
}
