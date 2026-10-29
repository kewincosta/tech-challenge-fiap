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
import { CustomersModule } from '../customers';
import { IdentityModule } from '../identity';
import { InventoryModule } from '../inventory';
import { ServicesModule } from '../services';
import { VehiclesModule } from '../vehicles';
import { AddRequestedServiceHandler } from './application/commands/add-requested-service/add-requested-service.handler';
import { ApplyDiscountHandler } from './application/commands/apply-discount/apply-discount.handler';
import { ApproveBudgetHandler } from './application/commands/approve-budget/approve-budget.handler';
import { AssignMechanicHandler } from './application/commands/assign-mechanic/assign-mechanic.handler';
import { CancelWorkOrderHandler } from './application/commands/cancel-work-order/cancel-work-order.handler';
import { CompleteDiagnosisHandler } from './application/commands/complete-diagnosis/complete-diagnosis.handler';
import { CompleteWorkOrderHandler } from './application/commands/complete-work-order/complete-work-order.handler';
import { CreateWorkOrderUseCase } from './application/commands/create-work-order/create-work-order.use-case';
import { DeliverVehicleHandler } from './application/commands/deliver-vehicle/deliver-vehicle.handler';
import { PlanPartHandler } from './application/commands/plan-part/plan-part.handler';
import { RejectBudgetHandler } from './application/commands/reject-budget/reject-budget.handler';
import { RemoveWorkOrderItemHandler } from './application/commands/remove-work-order-item/remove-work-order-item.handler';
import { ReturnPartsHandler } from './application/commands/return-parts/return-parts.handler';
import { StartDiagnosisHandler } from './application/commands/start-diagnosis/start-diagnosis.handler';
import { SubmitSupplementaryBudgetHandler } from './application/commands/submit-supplementary-budget/submit-supplementary-budget.handler';
import { WithdrawPartsHandler } from './application/commands/withdraw-parts/withdraw-parts.handler';
import {
  CUSTOMER_DIRECTORY,
  PART_CATALOG,
  SERVICE_CATALOG,
  STOCK_LEDGER,
  VEHICLE_DIRECTORY,
  WORK_ORDER_ACTORS,
  WORK_ORDER_METRICS_QUERY_PORT,
  WORK_ORDER_NUMBER_GENERATOR,
  WORK_ORDER_QUERY_PORT,
  WORK_ORDER_REPOSITORY,
} from './work-orders.tokens';
import { CustomerDirectory } from './application/ports/customer-directory.port';
import { PartCatalog } from './application/ports/part-catalog.port';
import { ServiceCatalog } from './application/ports/service-catalog.port';
import { StockLedger } from './application/ports/stock-ledger.port';
import { VehicleDirectory } from './application/ports/vehicle-directory.port';
import { WorkOrderActors } from './application/ports/work-order-actors.port';
import { WorkOrderMetricsQueryPort } from './application/ports/work-order-metrics-query.port';
import { WorkOrderNumberGenerator } from './application/ports/work-order-number-generator.port';
import { WorkOrderQueryPort } from './application/ports/work-order-query.port';
import { WorkOrderRepository } from './application/ports/work-order.repository';
import { GetAverageExecutionTimeHandler } from './application/queries/get-average-execution-time/get-average-execution-time.handler';
import { GetMyWorkOrderHandler } from './application/queries/get-my-work-order/get-my-work-order.handler';
import { GetMyWorkOrdersHandler } from './application/queries/get-my-work-orders/get-my-work-orders.handler';
import { GetWorkOrderTrailHandler } from './application/queries/get-work-order-trail/get-work-order-trail.handler';
import { GetWorkOrderHandler } from './application/queries/get-work-order/get-work-order.handler';
import { ListWorkOrdersHandler } from './application/queries/list-work-orders/list-work-orders.handler';
import { BudgetDecisionAuthorizer } from './application/services/budget-decision.authorizer';
import { CancellationAuthorizer } from './application/services/cancellation.authorizer';
import { WorkOrderCompletionAuthorizer } from './application/services/work-order-completion.authorizer';
import { CustomerDirectoryGateway } from './infrastructure/gateways/customer-directory.gateway';
import { PartCatalogGateway } from './infrastructure/gateways/part-catalog.gateway';
import { ServiceCatalogGateway } from './infrastructure/gateways/service-catalog.gateway';
import { StockLedgerGateway } from './infrastructure/gateways/stock-ledger.gateway';
import { VehicleDirectoryGateway } from './infrastructure/gateways/vehicle-directory.gateway';
import { WorkOrderActorsGateway } from './infrastructure/gateways/work-order-actors.gateway';
import { RandomWorkOrderNumberGenerator } from './infrastructure/random-work-order-number.generator';
import { WorkOrderBudgetOrmEntity } from './infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderEventOrmEntity } from './infrastructure/persistence/work-order-event.orm-entity';
import { WorkOrderPartOrmEntity } from './infrastructure/persistence/work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './infrastructure/persistence/work-order-service.orm-entity';
import { TypeOrmWorkOrderMetricsQueryAdapter } from './infrastructure/persistence/typeorm-work-order-metrics-query.adapter';
import { TypeOrmWorkOrderQueryAdapter } from './infrastructure/persistence/typeorm-work-order-query.adapter';
import { TypeOrmWorkOrderRepository } from './infrastructure/persistence/typeorm-work-order.repository';
import { WorkOrderOrmEntity } from './infrastructure/persistence/work-order.orm-entity';
import { WorkOrdersController } from './presentation/controllers/work-orders.controller';

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
        events: DomainEventPublisher,
      ) =>
        new CreateWorkOrderUseCase(
          workOrders,
          customers,
          vehicles,
          idGenerator,
          numberGenerator,
          clock,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        CUSTOMER_DIRECTORY,
        VEHICLE_DIRECTORY,
        ID_GENERATOR,
        WORK_ORDER_NUMBER_GENERATOR,
        CLOCK,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: AddRequestedServiceHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        serviceCatalog: ServiceCatalog,
        events: DomainEventPublisher,
      ) => new AddRequestedServiceHandler(workOrders, idGenerator, clock, serviceCatalog, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, SERVICE_CATALOG, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: PlanPartHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        partCatalog: PartCatalog,
        events: DomainEventPublisher,
      ) => new PlanPartHandler(workOrders, idGenerator, clock, partCatalog, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, PART_CATALOG, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RemoveWorkOrderItemHandler,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new RemoveWorkOrderItemHandler(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: AssignMechanicHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        clock: Clock,
        actors: WorkOrderActors,
        events: DomainEventPublisher,
      ) => new AssignMechanicHandler(workOrders, clock, actors, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, WORK_ORDER_ACTORS, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: StartDiagnosisHandler,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new StartDiagnosisHandler(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: CompleteDiagnosisHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CompleteDiagnosisHandler(workOrders, idGenerator, clock, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: SubmitSupplementaryBudgetHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new SubmitSupplementaryBudgetHandler(workOrders, idGenerator, clock, events),
      inject: [WORK_ORDER_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: ApproveBudgetHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: BudgetDecisionAuthorizer,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new ApproveBudgetHandler(workOrders, authorizer, clock, events),
      inject: [WORK_ORDER_REPOSITORY, BudgetDecisionAuthorizer, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: RejectBudgetHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: BudgetDecisionAuthorizer,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new RejectBudgetHandler(workOrders, authorizer, clock, events),
      inject: [WORK_ORDER_REPOSITORY, BudgetDecisionAuthorizer, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: WithdrawPartsHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        clock: Clock,
        stockLedger: StockLedger,
        events: DomainEventPublisher,
      ) => new WithdrawPartsHandler(workOrders, transactionRunner, clock, stockLedger, events),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        CLOCK,
        STOCK_LEDGER,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ReturnPartsHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        clock: Clock,
        stockLedger: StockLedger,
        events: DomainEventPublisher,
      ) => new ReturnPartsHandler(workOrders, transactionRunner, clock, stockLedger, events),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        CLOCK,
        STOCK_LEDGER,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: CompleteWorkOrderHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        authorizer: WorkOrderCompletionAuthorizer,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CompleteWorkOrderHandler(workOrders, authorizer, clock, events),
      inject: [WORK_ORDER_REPOSITORY, WorkOrderCompletionAuthorizer, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeliverVehicleHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        clock: Clock,
        stockLedger: StockLedger,
        events: DomainEventPublisher,
      ) => new DeliverVehicleHandler(workOrders, transactionRunner, clock, stockLedger, events),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        CLOCK,
        STOCK_LEDGER,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ApplyDiscountHandler,
      useFactory: (workOrders: WorkOrderRepository, clock: Clock, events: DomainEventPublisher) =>
        new ApplyDiscountHandler(workOrders, clock, events),
      inject: [WORK_ORDER_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: CancelWorkOrderHandler,
      useFactory: (
        workOrders: WorkOrderRepository,
        transactionRunner: TransactionRunner,
        authorizer: CancellationAuthorizer,
        clock: Clock,
        stockLedger: StockLedger,
        events: DomainEventPublisher,
      ) =>
        new CancelWorkOrderHandler(
          workOrders,
          transactionRunner,
          authorizer,
          clock,
          stockLedger,
          events,
        ),
      inject: [
        WORK_ORDER_REPOSITORY,
        TRANSACTION_RUNNER,
        CancellationAuthorizer,
        CLOCK,
        STOCK_LEDGER,
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
      provide: GetWorkOrderHandler,
      useFactory: (workOrderQuery: WorkOrderQueryPort) => new GetWorkOrderHandler(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: ListWorkOrdersHandler,
      useFactory: (workOrderQuery: WorkOrderQueryPort) => new ListWorkOrdersHandler(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: GetWorkOrderTrailHandler,
      useFactory: (workOrderQuery: WorkOrderQueryPort) =>
        new GetWorkOrderTrailHandler(workOrderQuery),
      inject: [WORK_ORDER_QUERY_PORT],
    },
    {
      provide: GetMyWorkOrdersHandler,
      useFactory: (workOrderQuery: WorkOrderQueryPort, customers: CustomerDirectory) =>
        new GetMyWorkOrdersHandler(workOrderQuery, customers),
      inject: [WORK_ORDER_QUERY_PORT, CUSTOMER_DIRECTORY],
    },
    {
      provide: GetMyWorkOrderHandler,
      useFactory: (workOrderQuery: WorkOrderQueryPort, customers: CustomerDirectory) =>
        new GetMyWorkOrderHandler(workOrderQuery, customers),
      inject: [WORK_ORDER_QUERY_PORT, CUSTOMER_DIRECTORY],
    },
    {
      provide: GetAverageExecutionTimeHandler,
      useFactory: (metricsQuery: WorkOrderMetricsQueryPort) =>
        new GetAverageExecutionTimeHandler(metricsQuery),
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
  ],
})
export class WorkOrdersModule {}
