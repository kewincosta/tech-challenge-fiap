import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { CustomerKeyResolver } from '../../../customers';
import { Vehicle } from '../../domain/entities/vehicle';
import { LicensePlateAlreadyInUseError } from '../../domain/errors/license-plate-already-in-use.error';
import { VehicleRepository } from '../../domain/repositories/vehicle.repository';
import { VehicleId } from '../../domain/value-objects/vehicle-id';
import { VehicleMapper } from './vehicle.mapper';
import { VehicleOrmEntity } from './vehicle.orm-entity';

const UNIQUE_VIOLATION = '23505';
const PLATE_CONSTRAINT = 'ux_vehicles_plate';

@Injectable()
export class TypeOrmVehicleRepository implements VehicleRepository {
  constructor(
    @InjectRepository(VehicleOrmEntity)
    private readonly vehicles: Repository<VehicleOrmEntity>,
    private readonly customerKeys: CustomerKeyResolver,
  ) {}

  async findById(id: VehicleId): Promise<Vehicle | null> {
    const row = await this.repo().findOne({ where: { externalId: id.value } });
    if (!row) {
      return null;
    }
    const customerExternalId = await this.customerKeys.toExternalId(row.customerInternalId);
    if (customerExternalId === null) {
      throw new Error(`Customer with internal id ${row.customerInternalId} not found`);
    }
    return VehicleMapper.toDomain(row, customerExternalId);
  }

  async save(vehicle: Vehicle): Promise<void> {
    const repo = this.repo();
    const row = VehicleMapper.toOrm(vehicle);
    const existing = await repo.findOne({
      where: { externalId: vehicle.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }
    const customerInternalId = await this.customerKeys.toInternalId(vehicle.customerId);
    if (customerInternalId === null) {
      throw new Error(`Customer ${vehicle.customerId} not found`);
    }
    row.customerInternalId = customerInternalId;
    try {
      await repo.save(row);
    } catch (error) {
      if (this.isUniqueViolation(error, PLATE_CONSTRAINT)) {
        throw new LicensePlateAlreadyInUseError();
      }
      throw error;
    }
  }

  private repo(): Repository<VehicleOrmEntity> {
    const manager = currentEntityManager();
    return manager ? manager.getRepository(VehicleOrmEntity) : this.vehicles;
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
