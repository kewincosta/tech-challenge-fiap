import { Inject, Injectable } from '@nestjs/common';
import { WORK_ORDER_ACTORS } from '../../work-orders.tokens';
import { WorkOrder } from '../../domain/entities/work-order';
import { CompletionForbiddenError } from '../../domain/errors/completion-forbidden.error';
import { WorkOrderActors } from '../ports/work-order-actors.port';

/**
 * The single place that decides whether an actor may complete a work order. The state machine
 * names "the assigned mechanic or an administrator", which `PermissionsGuard.every()` cannot
 * express, so the check lives here instead, reached through the `WorkOrderActors` port (AD-012)
 * and mirroring `BudgetDecisionAuthorizer`'s shape. Unlike that authorizer, this one refuses with
 * a forbidden error rather than a not-found one: every actor able to reach the completion route
 * already holds `work-orders:read`, so the work order's existence is not a secret from them.
 */
@Injectable()
export class WorkOrderCompletionAuthorizer {
  constructor(@Inject(WORK_ORDER_ACTORS) private readonly actors: WorkOrderActors) {}

  async assertMayComplete(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    const capabilities = await this.actors.capabilitiesOf(actorUserId);
    if (capabilities.managesWorkOrders) {
      return;
    }
    if (workOrder.assignedMechanicUserId === actorUserId) {
      return;
    }
    throw new CompletionForbiddenError();
  }
}
