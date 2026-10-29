import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { AssignedMechanicNotFoundError } from '../../../domain/errors/assigned-mechanic-not-found.error';
import { AssignedUserNotMechanicError } from '../../../domain/errors/assigned-user-not-mechanic.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import { WorkOrderActors } from '../../ports/work-order-actors.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AssignMechanicCommand } from './assign-mechanic.command';

export class AssignMechanicUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly clock: Clock,
    private readonly actors: WorkOrderActors,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AssignMechanicCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // A user that does not exist and a user without the role are told apart by the port: `null`
    // for the first, `isMechanic` false for the second (design.md's Risks & Concerns).
    const candidate = await this.actors.findMechanicCandidate(command.mechanicUserId);
    if (!candidate) {
      throw new AssignedMechanicNotFoundError();
    }
    if (!candidate.isMechanic) {
      throw new AssignedUserNotMechanicError();
    }

    workOrder.assignMechanic({
      mechanicUserId: command.mechanicUserId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.events.publish(workOrder.pullDomainEvents());
  }
}
