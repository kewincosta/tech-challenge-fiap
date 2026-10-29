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
import { DeactivateCustomerHandler } from './application/commands/deactivate-customer/deactivate-customer.handler';
import { RegisterCustomerHandler } from './application/commands/register-customer/register-customer.handler';
import { UpdateCustomerHandler } from './application/commands/update-customer/update-customer.handler';
import { CustomerAccounts } from './application/ports/customer-accounts.port';
import { CustomerQueryPort } from './application/ports/customer-query.port';
import { CustomerRepository } from './application/ports/customer.repository';
import { GetCustomerByUserIdHandler } from './application/queries/get-customer-by-user-id/get-customer-by-user-id.handler';
import { GetCustomerHandler } from './application/queries/get-customer/get-customer.handler';
import { ListCustomersHandler } from './application/queries/list-customers/list-customers.handler';
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
      provide: RegisterCustomerHandler,
      useFactory: (
        customers: CustomerRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        transactionRunner: TransactionRunner,
        accounts: CustomerAccounts,
      ) => new RegisterCustomerHandler(customers, idGenerator, clock, transactionRunner, accounts),
      inject: [CUSTOMER_REPOSITORY, ID_GENERATOR, CLOCK, TRANSACTION_RUNNER, CUSTOMER_ACCOUNTS],
    },
    {
      provide: UpdateCustomerHandler,
      useFactory: (customers: CustomerRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateCustomerHandler(customers, clock, events),
      inject: [CUSTOMER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateCustomerHandler,
      useFactory: (customers: CustomerRepository, clock: Clock, events: DomainEventPublisher) =>
        new DeactivateCustomerHandler(customers, clock, events),
      inject: [CUSTOMER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetCustomerHandler,
      useFactory: (customerQuery: CustomerQueryPort) => new GetCustomerHandler(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    {
      provide: GetCustomerByUserIdHandler,
      useFactory: (customerQuery: CustomerQueryPort) =>
        new GetCustomerByUserIdHandler(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    {
      provide: ListCustomersHandler,
      useFactory: (customerQuery: CustomerQueryPort) => new ListCustomersHandler(customerQuery),
      inject: [CUSTOMER_QUERY_PORT],
    },
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: CUSTOMER_QUERY_PORT, useClass: TypeOrmCustomerQueryAdapter },
    { provide: CUSTOMER_ACCOUNTS, useClass: CustomerAccountsGateway },
    CustomerKeyResolver,
  ],
  exports: [GetCustomerHandler, GetCustomerByUserIdHandler, CustomerKeyResolver],
})
export class CustomersModule {}
