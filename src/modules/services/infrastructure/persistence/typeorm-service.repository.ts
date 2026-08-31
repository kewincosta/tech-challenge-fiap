import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { Service } from '../../domain/entities/service';
import { ServiceNameAlreadyInUseError } from '../../domain/errors/service-name-already-in-use.error';
import { ServiceRepository } from '../../domain/repositories/service.repository';
import { ServiceStatus } from '../../domain/service-status';
import { ServiceId } from '../../domain/value-objects/service-id';
import { ServiceName } from '../../domain/value-objects/service-name';
import { ServiceMapper } from './service.mapper';
import { ServiceOrmEntity } from './service.orm-entity';

const UNIQUE_VIOLATION = '23505';
const ACTIVE_NAME_CONSTRAINT = 'ux_services_active_name';

@Injectable()
export class TypeOrmServiceRepository implements ServiceRepository {
  constructor(
    @InjectRepository(ServiceOrmEntity)
    private readonly services: Repository<ServiceOrmEntity>,
  ) {}

  async findById(id: ServiceId): Promise<Service | null> {
    const row = await this.repo().findOne({ where: { externalId: id.value } });
    return row ? ServiceMapper.toDomain(row) : null;
  }

  /**
   * Compared with lower() on both sides, matching the ux_services_active_name index exactly. If
   * only one side lowercased, the friendly pre-check and the constraint would disagree and a
   * duplicate would surface as a raw 500 instead of a 409 (design.md's Risks & Concerns).
   */
  async existsActiveByName(name: ServiceName, excludingId?: ServiceId): Promise<boolean> {
    const query = this.repo()
      .createQueryBuilder('service')
      .where('lower(service.name) = lower(:name)', { name: name.value })
      .andWhere('service.status = :status', { status: ServiceStatus.Active });
    if (excludingId) {
      query.andWhere('service.external_id <> :excluded', { excluded: excludingId.value });
    }
    return (await query.getCount()) > 0;
  }

  async save(service: Service): Promise<void> {
    const repo = this.repo();
    const row = ServiceMapper.toOrm(service);
    const existing = await repo.findOne({
      where: { externalId: service.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }
    try {
      await repo.save(row);
    } catch (error) {
      if (this.isUniqueViolation(error, ACTIVE_NAME_CONSTRAINT)) {
        throw new ServiceNameAlreadyInUseError();
      }
      throw error;
    }
  }

  /** See TypeOrmUserRepository.repo() - reads through the active transaction's manager, if any. */
  private repo(): Repository<ServiceOrmEntity> {
    const manager = currentEntityManager();
    return manager ? manager.getRepository(ServiceOrmEntity) : this.services;
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
