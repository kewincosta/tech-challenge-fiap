import { Inject, Injectable } from '@nestjs/common';
import { CUSTOMER_DIRECTORY, WORK_ORDER_ACTORS } from '../../work-orders.tokens';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';
import { CustomerDirectory } from '../ports/customer-directory.port';
import { WorkOrderActors } from '../ports/work-order-actors.port';

/**
 * The single place that decides whether an actor may approve or reject a work order's budget.
 * `PermissionsGuard` requires every permission it is given (`.every()`), so it cannot express
 * "the owning customer or a holder of `work-orders:decide`" - that check lives here instead,
 * reached through the `WorkOrderActors` and `CustomerDirectory` ports (AD-012). Refusing with
 * `WorkOrderNotFoundError` rather than a forbidden error means the API never confirms a work
 * order number exists to a stranger.
 */
@Injectable()
export class BudgetDecisionAuthorizer {
  constructor(
    @Inject(WORK_ORDER_ACTORS) private readonly actors: WorkOrderActors,
    @Inject(CUSTOMER_DIRECTORY) private readonly customers: CustomerDirectory,
  ) {}

  async assertMayDecide(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    const capabilities = await this.actors.capabilitiesOf(actorUserId);
    if (capabilities.decidesAnyBudget) {
      return;
    }

    const customer = await this.customers.findByUserId(actorUserId);
    if (customer && customer.id === workOrder.customerId) {
      return;
    }

    throw new WorkOrderNotFoundError();
  }
}
