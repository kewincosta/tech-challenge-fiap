import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddRequestedServiceHandler } from './application/commands/add-requested-service/add-requested-service.handler';
import { ApproveBudgetHandler } from './application/commands/approve-budget/approve-budget.handler';
import { AssignMechanicHandler } from './application/commands/assign-mechanic/assign-mechanic.handler';
import { CompleteDiagnosisHandler } from './application/commands/complete-diagnosis/complete-diagnosis.handler';
import { CreateWorkOrderHandler } from './application/commands/create-work-order/create-work-order.handler';
import { PlanPartHandler } from './application/commands/plan-part/plan-part.handler';
import { RejectBudgetHandler } from './application/commands/reject-budget/reject-budget.handler';
import { RemoveWorkOrderItemHandler } from './application/commands/remove-work-order-item/remove-work-order-item.handler';
import { StartDiagnosisHandler } from './application/commands/start-diagnosis/start-diagnosis.handler';
import { SubmitSupplementaryBudgetHandler } from './application/commands/submit-supplementary-budget/submit-supplementary-budget.handler';
import { WORK_ORDER_NUMBER_GENERATOR } from './application/ports/work-order-number-generator.port';
import { WORK_ORDER_QUERY_PORT } from './application/ports/work-order-query.port';
import { GetWorkOrderTrailHandler } from './application/queries/get-work-order-trail/get-work-order-trail.handler';
import { GetWorkOrderHandler } from './application/queries/get-work-order/get-work-order.handler';
import { ListWorkOrdersHandler } from './application/queries/list-work-orders/list-work-orders.handler';
import { BudgetDecisionAuthorizer } from './application/services/budget-decision.authorizer';
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
    BudgetDecisionAuthorizer,
    GetWorkOrderHandler,
    ListWorkOrdersHandler,
    GetWorkOrderTrailHandler,
    { provide: WORK_ORDER_REPOSITORY, useClass: TypeOrmWorkOrderRepository },
    { provide: WORK_ORDER_QUERY_PORT, useClass: TypeOrmWorkOrderQueryAdapter },
    { provide: WORK_ORDER_NUMBER_GENERATOR, useClass: RandomWorkOrderNumberGenerator },
  ],
})
export class WorkOrdersModule {}
