import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { UserKeyResolver } from '../../../identity';
import { CustomerRepository } from '../../application/ports/customer.repository';
import { Customer } from '../../domain/entities/customer';
import { CustomerAlreadyExistsForUserError } from '../../domain/errors/customer-already-exists-for-user.error';
import { CustomerId } from '../../domain/value-objects/customer-id';
import { CustomerMapper } from './customer.mapper';
import { CustomerOrmEntity } from './customer.orm-entity';

const UNIQUE_VIOLATION = '23505';
const USER_ID_CONSTRAINT = 'ux_customers_user_id';

@Injectable()
export class TypeOrmCustomerRepository implements CustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity)
    private readonly customers: Repository<CustomerOrmEntity>,
    private readonly userKeys: UserKeyResolver,
  ) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const row = await this.repo().findOne({ where: { externalId: id.value } });
    if (!row) {
      return null;
    }
    const userExternalId = await this.userKeys.toExternalId(row.userInternalId);
    if (userExternalId === null) {
      throw new Error(`User with internal id ${row.userInternalId} not found`);
    }
    return CustomerMapper.toDomain(row, userExternalId);
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const userInternalId = await this.userKeys.toInternalId(userId);
    if (userInternalId === null) {
      return false;
    }
    return this.repo().exists({ where: { userInternalId } });
  }

  async save(customer: Customer): Promise<void> {
    const repo = this.repo();
    const row = CustomerMapper.toOrm(customer);
    const existing = await repo.findOne({
      where: { externalId: customer.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }
    const userInternalId = await this.userKeys.toInternalId(customer.userId);
    if (userInternalId === null) {
      throw new Error(`User ${customer.userId} not found`);
    }
    row.userInternalId = userInternalId;
    try {
      await repo.save(row);
    } catch (error) {
      if (this.isUniqueViolation(error, USER_ID_CONSTRAINT)) {
        throw new CustomerAlreadyExistsForUserError();
      }
      throw error;
    }
  }

  /** See TypeOrmUserRepository.repo() - reads through the active transaction's manager, if any. */
  private repo(): Repository<CustomerOrmEntity> {
    const manager = currentEntityManager();
    return manager ? manager.getRepository(CustomerOrmEntity) : this.customers;
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
