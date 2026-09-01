import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { EffectiveAccessDto } from '../../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { AssignedMechanicNotFoundError } from '../../../domain/errors/assigned-mechanic-not-found.error';
import { AssignedUserNotMechanicError } from '../../../domain/errors/assigned-user-not-mechanic.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { AssignMechanicCommand } from './assign-mechanic.command';

const MECHANIC_ROLE = 'MECHANIC';

@CommandHandler(AssignMechanicCommand)
export class AssignMechanicHandler implements ICommandHandler<AssignMechanicCommand, void> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AssignMechanicCommand): Promise<void> {
    const workOrder = await this.workOrders.findByNumber(
      WorkOrderNumber.create(command.workOrderNumber),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }

    // Existence first: the effective-access read alone answers { roles: [], permissions: [] }
    // both for an unknown user and for one with no roles, so it cannot tell them apart
    // (design.md's Risks & Concerns).
    const targetUser = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(command.mechanicUserId),
    );
    if (!targetUser) {
      throw new AssignedMechanicNotFoundError();
    }

    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(command.mechanicUserId),
    );
    if (!access.roles.includes(MECHANIC_ROLE)) {
      throw new AssignedUserNotMechanicError();
    }

    workOrder.assignMechanic({
      mechanicUserId: command.mechanicUserId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
    await this.workOrders.save(workOrder);
    this.eventBus.publishAll(workOrder.pullDomainEvents());
  }
}
