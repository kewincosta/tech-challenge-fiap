import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { BudgetId } from '../../../domain/value-objects/budget-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CompleteDiagnosisCommand } from './complete-diagnosis.command';

export class CompleteDiagnosisHandler {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CompleteDiagnosisCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // No price and no total ever come from the caller - rule 29 holds by construction. The
    // aggregate computes the round's total itself, from its own items.
    workOrder.completeDiagnosis({
      budgetId: BudgetId.create(this.idGenerator.generate()),
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
