import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddRequestedServiceHandler } from './application/commands/add-requested-service/add-requested-service.handler';
import { ApplyDiscountHandler } from './application/commands/apply-discount/apply-discount.handler';
import { ApproveBudgetHandler } from './application/commands/approve-budget/approve-budget.handler';
import { AssignMechanicHandler } from './application/commands/assign-mechanic/assign-mechanic.handler';
import { CancelWorkOrderHandler } from './application/commands/cancel-work-order/cancel-work-order.handler';
import { CompleteDiagnosisHandler } from './application/commands/complete-diagnosis/complete-diagnosis.handler';
import { CompleteWorkOrderHandler } from './application/commands/complete-work-order/complete-work-order.handler';
import { CreateWorkOrderHandler } from './application/commands/create-work-order/create-work-order.handler';
import { DeliverVehicleHandler } from './application/commands/deliver-vehicle/deliver-vehicle.handler';
import { PlanPartHandler } from './application/commands/plan-part/plan-part.handler';
import { RejectBudgetHandler } from './application/commands/reject-budget/reject-budget.handler';
import { RemoveWorkOrderItemHandler } from './application/commands/remove-work-order-item/remove-work-order-item.handler';
import { ReturnPartsHandler } from './application/commands/return-parts/return-parts.handler';
import { StartDiagnosisHandler } from './application/commands/start-diagnosis/start-diagnosis.handler';
import { SubmitSupplementaryBudgetHandler } from './application/commands/submit-supplementary-budget/submit-supplementary-budget.handler';
import { WithdrawPartsHandler } from './application/commands/withdraw-parts/withdraw-parts.handler';
import { WORK_ORDER_NUMBER_GENERATOR } from './application/ports/work-order-number-generator.port';
import { WORK_ORDER_QUERY_PORT } from './application/ports/work-order-query.port';
import { GetMyWorkOrderHandler } from './application/queries/get-my-work-order/get-my-work-order.handler';
import { GetMyWorkOrdersHandler } from './application/queries/get-my-work-orders/get-my-work-orders.handler';
import { GetWorkOrderTrailHandler } from './application/queries/get-work-order-trail/get-work-order-trail.handler';
import { GetWorkOrderHandler } from './application/queries/get-work-order/get-work-order.handler';
import { ListWorkOrdersHandler } from './application/queries/list-work-orders/list-work-orders.handler';
import { BudgetDecisionAuthorizer } from './application/services/budget-decision.authorizer';
import { CancellationAuthorizer } from './application/services/cancellation.authorizer';
import { WorkOrderCompletionAuthorizer } from './application/services/work-order-completion.authorizer';
import { WORK_ORDER_REPOSITORY } from './domain/repositories/work-order.repository';
import { RandomWorkOrderNumberGenerator } from './infrastructure/random-work-order-number.generator';
import { WorkOrderBudgetOrmEntity } from './infrastructure/persistence/work-order-budget.orm-entity';
import { WorkOrderEventOrmEntity } from './infrastructure/persistence/work-order-event.orm-entity';
import { WorkOrderPartOrmEntity } from './infrastructure/persistence/work-order-part.orm-entity';
import { WorkOrderServiceOrmEntity } from './infrastructure/persistence/work-order-service.orm-entity';
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
  ],
  controllers: [WorkOrdersController],
  providers: [
    CreateWorkOrderHandler,
    AddRequestedServiceHandler,
    PlanPartHandler,
    RemoveWorkOrderItemHandler,
    AssignMechanicHandler,
    StartDiagnosisHandler,
    CompleteDiagnosisHandler,
    SubmitSupplementaryBudgetHandler,
    ApproveBudgetHandler,
    RejectBudgetHandler,
    WithdrawPartsHandler,
    ReturnPartsHandler,
    CompleteWorkOrderHandler,
    DeliverVehicleHandler,
    ApplyDiscountHandler,
    CancelWorkOrderHandler,
    BudgetDecisionAuthorizer,
    WorkOrderCompletionAuthorizer,
    CancellationAuthorizer,
    GetWorkOrderHandler,
    ListWorkOrdersHandler,
    GetWorkOrderTrailHandler,
    GetMyWorkOrdersHandler,
    GetMyWorkOrderHandler,
    { provide: WORK_ORDER_REPOSITORY, useClass: TypeOrmWorkOrderRepository },
    { provide: WORK_ORDER_QUERY_PORT, useClass: TypeOrmWorkOrderQueryAdapter },
    { provide: WORK_ORDER_NUMBER_GENERATOR, useClass: RandomWorkOrderNumberGenerator },
  ],
})
export class WorkOrdersModule {}
