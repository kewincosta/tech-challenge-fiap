import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { outboxConfig } from '../../config/outbox.config';
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
import { OutboxSettings } from './application/outbox-settings';
import { AccountStepLog } from './application/ports/account-step-log.port';
import { CustomerAccounts } from './application/ports/customer-accounts.port';
import { CustomerQueryPort } from './application/ports/customer-query.port';
import { CustomerRepository } from './application/ports/customer.repository';
import { PendingAccountSteps } from './application/ports/pending-account-steps.port';
import { GetCustomerByUserIdUseCase } from './application/queries/get-customer-by-user-id/get-customer-by-user-id.use-case';
import { GetCustomerUseCase } from './application/queries/get-customer/get-customer.use-case';
import { ListCustomersUseCase } from './application/queries/list-customers/list-customers.use-case';
import { AccountStepApplier } from './application/services/account-step-applier';
import {
  ACCOUNT_STEP_LOG,
  CUSTOMER_ACCOUNTS,
  CUSTOMER_QUERY_PORT,
  CUSTOMER_REPOSITORY,
  OUTBOX_SETTINGS,
  PENDING_ACCOUNT_STEPS,
} from './customers.tokens';
import { CustomerAccountsGateway } from './infrastructure/gateways/customer-accounts.gateway';
import { AccountStepProcessor } from './infrastructure/outbox/account-step-processor';
import { NestAccountStepLog } from './infrastructure/outbox/nest-account-step-log';
import { CustomerKeyResolver } from './infrastructure/persistence/customer-key-resolver';
import { CustomerOrmEntity } from './infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from './infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';
import { TypeOrmPendingAccountSteps } from './infrastructure/persistence/typeorm-pending-account-steps';
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
        steps: PendingAccountSteps,
        settings: OutboxSettings,
      ) =>
        new RegisterCustomerUseCase(
          customers,
          idGenerator,
          clock,
          transactionRunner,
          accounts,
          steps,
          settings,
        ),
      inject: [
        CUSTOMER_REPOSITORY,
        ID_GENERATOR,
        CLOCK,
        TRANSACTION_RUNNER,
        CUSTOMER_ACCOUNTS,
        PENDING_ACCOUNT_STEPS,
        OUTBOX_SETTINGS,
      ],
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
    { provide: PENDING_ACCOUNT_STEPS, useClass: TypeOrmPendingAccountSteps },
    { provide: ACCOUNT_STEP_LOG, useClass: NestAccountStepLog },
    {
      provide: OUTBOX_SETTINGS,
      useFactory: (config: ConfigType<typeof outboxConfig>): OutboxSettings => ({
        pollIntervalMs: config.pollIntervalMs,
        graceSeconds: config.graceSeconds,
        maxAttempts: config.maxAttempts,
      }),
      inject: [outboxConfig.KEY],
    },
    {
      provide: AccountStepApplier,
      useFactory: (
        steps: PendingAccountSteps,
        accounts: CustomerAccounts,
        clock: Clock,
        log: AccountStepLog,
        settings: OutboxSettings,
      ) => new AccountStepApplier(steps, accounts, clock, log, settings),
      inject: [PENDING_ACCOUNT_STEPS, CUSTOMER_ACCOUNTS, CLOCK, ACCOUNT_STEP_LOG, OUTBOX_SETTINGS],
    },
    AccountStepProcessor,
    CustomerKeyResolver,
  ],
  exports: [GetCustomerUseCase, GetCustomerByUserIdUseCase, CustomerKeyResolver],
})
export class CustomersModule {}
