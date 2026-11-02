import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig } from '../../config/app.config';
import { mailConfig } from '../../config/mail.config';
import { outboxConfig } from '../../config/outbox.config';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../shared/application/ports/transaction-runner.port';
import { InMemoryDomainEventDispatcher } from '../../shared/infrastructure/events/in-memory-domain-event-dispatcher';
import {
  CLOCK,
  DOMAIN_EVENT_PUBLISHER,
  ID_GENERATOR,
  TRANSACTION_RUNNER,
} from '../../shared/shared.tokens';
import { CustomersModule } from '../customers';
import { IdentityModule } from '../identity';
import { InventoryModule } from '../inventory';
import { ServicesModule } from '../services';
import { VehiclesModule } from '../vehicles';
import { AddRequestedServiceUseCase } from './application/commands/add-requested-service/add-requested-service.use-case';
import { ApplyDiscountUseCase } from './application/commands/apply-discount/apply-discount.use-case';
import { ApproveBudgetUseCase } from './application/commands/approve-budget/approve-budget.use-case';
import { AssignMechanicUseCase } from './application/commands/assign-mechanic/assign-mechanic.use-case';
import { CancelWorkOrderUseCase } from './application/commands/cancel-work-order/cancel-work-order.use-case';
import { CompleteDiagnosisUseCase } from './application/commands/complete-diagnosis/complete-diagnosis.use-case';
import { CompleteWorkOrderUseCase } from './application/commands/complete-work-order/complete-work-order.use-case';
import { CreateWorkOrderUseCase } from './application/commands/create-work-order/create-work-order.use-case';
import { DeliverVehicleUseCase } from './application/commands/deliver-vehicle/deliver-vehicle.use-case';
import { PlanPartUseCase } from './application/commands/plan-part/plan-part.use-case';
import { RejectBudgetUseCase } from './application/commands/reject-budget/reject-budget.use-case';
import { RemoveWorkOrderItemUseCase } from './application/commands/remove-work-order-item/remove-work-order-item.use-case';
import { ReturnPartsUseCase } from './application/commands/return-parts/return-parts.use-case';
import { StartDiagnosisUseCase } from './application/commands/start-diagnosis/start-diagnosis.use-case';
import { SubmitSupplementaryBudgetUseCase } from './application/commands/submit-supplementary-budget/submit-supplementary-budget.use-case';
import { WithdrawPartsUseCase } from './application/commands/withdraw-parts/withdraw-parts.use-case';
import {
  BUDGET_DECISION_LINKS,
  BUDGET_LINK_VERIFIER,
  CUSTOMER_DIRECTORY,
  MAILER,
  OUTBOX_SETTINGS,
  PART_CATALOG,
  PENDING_STOCK_STEPS,
  SERVICE_CATALOG,
  STATUS_MAIL_LOG,
  STOCK_LEDGER,
  STOCK_STEP_LOG,
  VEHICLE_DIRECTORY,
  WORK_ORDER_ACTORS,
  WORK_ORDER_METRICS_QUERY_PORT,
  WORK_ORDER_NUMBER_GENERATOR,
  WORK_ORDER_QUERY_PORT,
  WORK_ORDER_REPOSITORY,
} from './work-orders.tokens';
import { OutboxSettings } from './application/outbox-settings';
import {
  BudgetDecisionLinks,
  BudgetLinkVerifier,
} from './application/ports/budget-decision-links.port';
import { CustomerDirectory } from './application/ports/customer-directory.port';
import { Mailer } from './application/ports/mailer.port';
import { PartCatalog } from './application/ports/part-catalog.port';
import { PendingStockSteps } from './application/ports/pending-stock-steps.port';
import { ServiceCatalog } from './application/ports/service-catalog.port';
import { StatusMailLog } from './application/ports/status-mail-log.port';
import { StockLedger } from './application/ports/stock-ledger.port';
import { StockStepLog } from './application/ports/stock-step-log.port';
import { VehicleDirectory } from './application/ports/vehicle-directory.port';
import { WorkOrderActors } from './application/ports/work-order-actors.port';
import { WorkOrderMetricsQueryPort } from './application/ports/work-order-metrics-query.port';
import { WorkOrderNumberGenerator } from './application/ports/work-order-number-generator.port';
import { WorkOrderQueryPort } from './application/ports/work-order-query.port';
import { WorkOrderRepository } from './application/ports/work-order.repository';
import { GetAverageExecutionTimeUseCase } from './application/queries/get-average-execution-time/get-average-execution-time.use-case';
import { GetMyWorkOrderUseCase } from './application/queries/get-my-work-order/get-my-work-order.use-case';
import { GetMyWorkOrdersUseCase } from './application/queries/get-my-work-orders/get-my-work-orders.use-case';
import { GetWorkOrderTrailUseCase } from './application/queries/get-work-order-trail/get-work-order-trail.use-case';
import { GetWorkOrderUseCase } from './application/queries/get-work-order/get-work-order.use-case';
import { ListWorkOrdersUseCase } from './application/queries/list-work-orders/list-work-orders.use-case';
import { BudgetDecisionAuthorizer } from './application/services/budget-decision.authorizer';
import { CancellationAuthorizer } from './application/services/cancellation.authorizer';
import { StockStepApplier } from './application/services/stock-step-applier';
import { WorkOrderCompletionAuthorizer } from './application/services/work-order-completion.authorizer';
import { StatusMailSubscriber } from './application/subscribers/status-mail.subscriber';
import { WorkOrderStatusChanged } from './domain/events/work-order-status-changed.event';
import { CustomerDirectoryGateway } from './infrastructure/gateways/customer-directory.gateway';
import { PartCatalogGateway } from './infrastructure/gateways/part-catalog.gateway';
import { ServiceCatalogGateway } from './infrastructure/gateways/service-catalog.gateway';
import { StockLedgerGateway } from './infrastructure/gateways/stock-ledger.gateway';
import { VehicleDirectoryGateway } from './infrastructure/gateways/vehicle-directory.gateway';
import { WorkOrderActorsGateway } from './infrastructure/gateways/work-order-actors.gateway';
import { NestStatusMailLog } from './infrastructure/mail/nest-status-mail-log';
import { SmtpMailer } from './infrastructure/mail/smtp-mailer';
import { NestStockStepLog } from './infrastructure/outbox/nest-stock-step-log';
import { StockStepProcessor } from './infrastructure/outbox/stock-step-processor';
import { RandomWorkOrderNumberGenerator } from './infrastructure/random-work-order-number.generator';
import { WorkOrderBudgetOrmEntity } from './infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderEventOrmEntity } from './infrastructure/persistence/work-order-event.orm-entity';
import { WorkOrderPartOrmEntity } from './infrastructure/persistence/work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './infrastructure/persistence/work-order-service.orm-entity';
import { TypeOrmPendingStockSteps } from './infrastructure/persistence/typeorm-pending-stock-steps';
import { TypeOrmWorkOrderMetricsQueryAdapter } from './infrastructure/persistence/typeorm-work-order-metrics-query.adapter';
import { TypeOrmWorkOrderQueryAdapter } from './infrastructure/persistence/typeorm-work-order-query.adapter';
import { TypeOrmWorkOrderRepository } from './infrastructure/persistence/typeorm-work-order.repository';
import { WorkOrderOrmEntity } from './infrastructure/persistence/work-order.orm-entity';
import { WorkOrdersController } from './presentation/controllers/work-orders.controller';
import { HttpBudgetDecisionLinks } from './presentation/http-budget-decision-links';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrderOrmEntity,
      WorkOrderServiceOrmEntity,
      WorkOrderPartOrmEntity,
      WorkOrderEventOrmEntity,
      WorkOrderBudgetOrmEntity,
    ]),
    CustomersModule,
    VehiclesModule,
    ServicesModule,
    InventoryModule,
    IdentityModule,
  ],
  controllers: [WorkOrdersController],
  providers: [
    {
      provide: CreateWorkOrderUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        customers: CustomerDirectory,
        vehicles: VehicleDirectory,
        idGenerator: IdGenerator,
        numberGenerator: WorkOrderNumberGenerator,
        clock: Clock,
        serviceCatalog: ServiceCatalog,
        partCatalog: PartCatalog,
        events: DomainEventPublisher,
      ) =>
        new CreateWorkOrderUseCase(
          workOrders,
          customers,
          vehicles,
          idGenerator,
          numberGenerator,
          clock,
          serviceCatalog,
          partCatalog,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        CUSTOMER_DIRECTORY,
        VEHICLE_DIRECTORY,
        ID_GENERATOR,
        WORK_ORDER_NUMBER_GENERATOR,
        CLOCK,
        SERVICE_CATALOG,
        PART_CATALOG,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: AddRequestedServiceUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        serviceCatalog: ServiceCatalog,
        events: DomainEventPublisher,
      ) => new AddRequestedServiceUseCase(workOrders, idGenerator, clock, serviceCatalog, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, SERVICE_CATALOG, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: PlanPartUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        partCatalog: PartCatalog,
        events: DomainEventPublisher,
      ) => new PlanPartUseCase(workOrders, idGenerator, clock, partCatalog, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, PART_CATALOG, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RemoveWorkOrderItemUseCase,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new RemoveWorkOrderItemUseCase(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: AssignMechanicUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        clock: Clock,
        actors: WorkOrderActors,
        events: DomainEventPublisher,
      ) => new AssignMechanicUseCase(workOrders, clock, actors, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, WORK_ORDER_ACTORS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: StartDiagnosisUseCase,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new StartDiagnosisUseCase(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: CompleteDiagnosisUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CompleteDiagnosisUseCase(workOrders, idGenerator, clock, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: SubmitSupplementaryBudgetUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new SubmitSupplementaryBudgetUseCase(workOrders, idGenerator, clock, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ApproveBudgetUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: BudgetDecisionAuthorizer,
        links: BudgetLinkVerifier,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ApproveBudgetUseCase(workOrders, authorizer, links, clock, events),
      inject: [
        WORK_ORDER_REPOSITORY,
        BudgetDecisionAuthorizer,
        BUDGET_LINK_VERIFIER,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: RejectBudgetUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: BudgetDecisionAuthorizer,
        links: BudgetLinkVerifier,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new RejectBudgetUseCase(workOrders, authorizer, links, clock, events),
      inject: [
        WORK_ORDER_REPOSITORY,
        BudgetDecisionAuthorizer,
        BUDGET_LINK_VERIFIER,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: WithdrawPartsUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        stockLedger: StockLedger,
        steps: PendingStockSteps,
        applier: StockStepApplier,
        settings: OutboxSettings,
        events: DomainEventPublisher,
      ) =>
        new WithdrawPartsUseCase(
          workOrders,
          transactionRunner,
          idGenerator,
          clock,
          stockLedger,
          steps,
          applier,
          settings,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        STOCK_LEDGER,
        PENDING_STOCK_STEPS,
        StockStepApplier,
        OUTBOX_SETTINGS,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ReturnPartsUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        steps: PendingStockSteps,
        applier: StockStepApplier,
        events: DomainEventPublisher,
      ) =>
        new ReturnPartsUseCase(
          workOrders,
          transactionRunner,
          idGenerator,
          clock,
          steps,
          applier,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        PENDING_STOCK_STEPS,
        StockStepApplier,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: CompleteWorkOrderUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: WorkOrderCompletionAuthorizer,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CompleteWorkOrderUseCase(workOrders, authorizer, clock, events),
      inject: [WORK_ORDER_REPOSITORY, WorkOrderCompletionAuthorizer, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeliverVehicleUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        idGenerator: IdGenerator,
        clock: Clock,
        steps: PendingStockSteps,
        applier: StockStepApplier,
        events: DomainEventPublisher,
      ) =>
        new DeliverVehicleUseCase(
          workOrders,
          transactionRunner,
          idGenerator,
          clock,
          steps,
          applier,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        ID_GENERATOR,
        CLOCK,
        PENDING_STOCK_STEPS,
        StockStepApplier,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ApplyDiscountUseCase,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new ApplyDiscountUseCase(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: CancelWorkOrderUseCase,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        authorizer: CancellationAuthorizer,
        idGenerator: IdGenerator,
        clock: Clock,
        steps: PendingStockSteps,
        applier: StockStepApplier,
        events: DomainEventPublisher,
      ) =>
        new CancelWorkOrderUseCase(
          workOrders,
          transactionRunner,
          authorizer,
          idGenerator,
          clock,
          steps,
          applier,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        CancellationAuthorizer,
        ID_GENERATOR,
        CLOCK,
        PENDING_STOCK_STEPS,
        StockStepApplier,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: BudgetDecisionAuthorizer,
      useFactory: (actors: WorkOrderActors, customers: CustomerDirectory) =>
        new BudgetDecisionAuthorizer(actors, customers),
      inject: [WORK_ORDER_ACTORS, CUSTOMER_DIRECTORY],
    },
    {
      provide: WorkOrderCompletionAuthorizer,
      useFactory: (actors: WorkOrderActors) => new WorkOrderCompletionAuthorizer(actors),
      inject: [WORK_ORDER_ACTORS],
    },
    {
      provide: CancellationAuthorizer,
      useFactory: (actors: WorkOrderActors) => new CancellationAuthorizer(actors),
      inject: [WORK_ORDER_ACTORS],
    },
    {
      provide: GetWorkOrderUseCase,
      useFactory: (workOrderQuery: WorkOrderQueryPort) => new GetWorkOrderUseCase(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: ListWorkOrdersUseCase,
      useFactory: (workOrderQuery: WorkOrderQueryPort) => new ListWorkOrdersUseCase(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: GetWorkOrderTrailUseCase,
      useFactory: (workOrderQuery: WorkOrderQueryPort) =>
        new GetWorkOrderTrailUseCase(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: GetMyWorkOrdersUseCase,
      useFactory: (workOrderQuery: WorkOrderQueryPort, customers: CustomerDirectory) =>
        new GetMyWorkOrdersUseCase(workOrderQuery, customers),
      inject: [WORK_ORDER_QUERY_PORT, CUSTOMER_DIRECTORY],
    },
    {
      provide: GetMyWorkOrderUseCase,
      useFactory: (workOrderQuery: WorkOrderQueryPort, customers: CustomerDirectory) =>
        new GetMyWorkOrderUseCase(workOrderQuery, customers),
      inject: [WORK_ORDER_QUERY_PORT, CUSTOMER_DIRECTORY],
    },
    {
      provide: GetAverageExecutionTimeUseCase,
      useFactory: (metricsQuery: WorkOrderMetricsQueryPort) =>
        new GetAverageExecutionTimeUseCase(metricsQuery),
      inject: [WORK_ORDER_METRICS_QUERY_PORT],
    },
    { provide: WORK_ORDER_REPOSITORY, useClass: TypeOrmWorkOrderRepository },
    { provide: WORK_ORDER_QUERY_PORT, useClass: TypeOrmWorkOrderQueryAdapter },
    { provide: WORK_ORDER_METRICS_QUERY_PORT, useClass: TypeOrmWorkOrderMetricsQueryAdapter },
    { provide: WORK_ORDER_NUMBER_GENERATOR, useClass: RandomWorkOrderNumberGenerator },
    { provide: CUSTOMER_DIRECTORY, useClass: CustomerDirectoryGateway },
    { provide: VEHICLE_DIRECTORY, useClass: VehicleDirectoryGateway },
    { provide: SERVICE_CATALOG, useClass: ServiceCatalogGateway },
    { provide: PART_CATALOG, useClass: PartCatalogGateway },
    { provide: STOCK_LEDGER, useClass: StockLedgerGateway },
    { provide: WORK_ORDER_ACTORS, useClass: WorkOrderActorsGateway },
    { provide: PENDING_STOCK_STEPS, useClass: TypeOrmPendingStockSteps },
    { provide: STOCK_STEP_LOG, useClass: NestStockStepLog },
    {
      provide: HttpBudgetDecisionLinks,
      useFactory: (config: ConfigType<typeof appConfig>) =>
        new HttpBudgetDecisionLinks(config.publicUrl),
      inject: [appConfig.KEY],
    },
    { provide: BUDGET_DECISION_LINKS, useExisting: HttpBudgetDecisionLinks },
    { provide: BUDGET_LINK_VERIFIER, useExisting: HttpBudgetDecisionLinks },
    {
      provide: MAILER,
      useFactory: (config: ConfigType<typeof mailConfig>) => SmtpMailer.create(config),
      inject: [mailConfig.KEY],
    },
    { provide: STATUS_MAIL_LOG, useClass: NestStatusMailLog },
    {
      provide: StatusMailSubscriber,
      useFactory: (
        customers: CustomerDirectory,
        mailer: Mailer,
        links: BudgetDecisionLinks,
        log: StatusMailLog,
      ) => new StatusMailSubscriber(customers, mailer, links, log),
      inject: [CUSTOMER_DIRECTORY, MAILER, BUDGET_DECISION_LINKS, STATUS_MAIL_LOG],
    },
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
      provide: StockStepApplier,
      useFactory: (
        steps: PendingStockSteps,
        stockLedger: StockLedger,
        clock: Clock,
        log: StockStepLog,
        settings: OutboxSettings,
      ) => new StockStepApplier(steps, stockLedger, clock, log, settings),
      inject: [PENDING_STOCK_STEPS, STOCK_LEDGER, CLOCK, STOCK_STEP_LOG, OUTBOX_SETTINGS],
    },
    StockStepProcessor,
  ],
})
export class WorkOrdersModule implements OnModuleInit {
  constructor(
    private readonly dispatcher: InMemoryDomainEventDispatcher,
    private readonly statusMail: StatusMailSubscriber,
  ) {}

  // Every status change a use case publishes after its commit reaches the customer by e-mail.
  onModuleInit(): void {
    this.dispatcher.subscribe(WorkOrderStatusChanged, this.statusMail);
  }
}
