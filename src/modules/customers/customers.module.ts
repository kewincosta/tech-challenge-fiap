import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../shared/application/ports/transaction-runner.port';
import {
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  TRANSACTION_RUNNER,
} from '../../shared/shared.tokens';
import { IdentityModule } from '../identity';
import { DeactivateCustomerUseCase } from './application/commands/deactivate-customer/deactivate-customer.use-case';
import { RegisterCustomerUseCase } from './application/commands/register-customer/register-customer.use-case';
import { UpdateCustomerUseCase } from './application/commands/update-customer/update-customer.use-case';
import { CustomerAccounts } from './application/ports/customer-accounts.port';
import { CustomerQueryPort } from './application/ports/customer-query.port';
import { CustomerRepository } from './application/ports/customer.repository';
import { GetCustomerByUserIdUseCase } from './application/queries/get-customer-by-user-id/get-customer-by-user-id.use-case';
import { GetCustomerUseCase } from './application/queries/get-customer/get-customer.use-case';
import { ListCustomersUseCase } from './application/queries/list-customers/list-customers.use-case';
import { CUSTOMER_ACCOUNTS, CUSTOMER_QUERY_PORT, CUSTOMER_REPOSITORY } from './customers.tokens';
import { CustomerAccountsGateway } from './infrastructure/gateways/customer-accounts.gateway';
import { CustomerKeyResolver } from './infrastructure/persistence/customer-key-resolver';
import { CustomerOrmEntity } from './infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from './infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';
import { CustomersController } from './presentation/controllers/customers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity]), IdentityModule],
  controllers: [CustomersController],
  providers: [
    {
      provide: RegisterCustomerUseCase,
      useFactory: (
        customers: CustomerRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        transactionRunner: TransactionRunner,
        accounts: CustomerAccounts,
      ) => new RegisterCustomerUseCase(customers, idGenerator, clock, transactionRunner, accounts),
      inject: [CUSTOMER_REPOSITORY, ID_GENERATOR, CLOCK, TRANSACTION_RUNNER, CUSTOMER_ACCOUNTS],
    },
    {
      provide: UpdateCustomerUseCase,
      useFactory: (customers: CustomerRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateCustomerUseCase(customers, clock, events),
      inject: [CUSTOMER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateCustomerUseCase,
      useFactory: (customers: CustomerRepository, clock: Clock, events: DomainEventPublisher) =>
        new DeactivateCustomerUseCase(customers, clock, events),
      inject: [CUSTOMER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetCustomerUseCase,
      useFactory: (customerQuery: CustomerQueryPort) => new GetCustomerUseCase(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    {
      provide: GetCustomerByUserIdUseCase,
      useFactory: (customerQuery: CustomerQueryPort) =>
        new GetCustomerByUserIdUseCase(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    {
      provide: ListCustomersUseCase,
      useFactory: (customerQuery: CustomerQueryPort) => new ListCustomersUseCase(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: CUSTOMER_QUERY_PORT, useClass: TypeOrmCustomerQueryAdapter },
    { provide: CUSTOMER_ACCOUNTS, useClass: CustomerAccountsGateway },
    CustomerKeyResolver,
  ],
  exports: [GetCustomerUseCase, GetCustomerByUserIdUseCase, CustomerKeyResolver],
})
export class CustomersModule {}
