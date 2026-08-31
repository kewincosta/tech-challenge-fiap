import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { Customer } from '../../domain/entities/customer';
import { CustomerAlreadyExistsForUserError } from '../../domain/errors/customer-already-exists-for-user.error';
import { CustomerRepository } from '../../domain/repositories/customer.repository';
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
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const row = await this.repo().findOne({ where: { externalId: id.value } });
    if (!row) {
      return null;
    }
    const userExternalId = await this.resolveUserExternalId(row.userInternalId);
    return CustomerMapper.toDomain(row, userExternalId);
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const runner = currentEntityManager() ?? this.dataSource;
    const rows: unknown[] = await runner.query(
      `SELECT c.id FROM customers c JOIN users u ON u.id = c.user_id WHERE u.external_id = $1`,
      [userId],
    );
    return rows.length > 0;
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
    row.userInternalId = await this.resolveUserInternalId(customer.userId);
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

  private async resolveUserInternalId(userExternalId: string): Promise<string> {
    const runner = currentEntityManager() ?? this.dataSource;
    const rows: Array<{ id: string }> = await runner.query(
      `SELECT id FROM users WHERE external_id = $1`,
      [userExternalId],
    );
    if (rows.length === 0) {
      throw new Error(`User ${userExternalId} not found`);
    }
    return rows[0].id;
  }

  private async resolveUserExternalId(userInternalId: string): Promise<string> {
    const runner = currentEntityManager() ?? this.dataSource;
    const rows: Array<{ external_id: string }> = await runner.query(
      `SELECT external_id FROM users WHERE id = $1`,
      [userInternalId],
    );
    return rows[0].external_id;
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION &&
      (error.driverError as { constraint?: string }).constraint === constraint
    );
  }
}
