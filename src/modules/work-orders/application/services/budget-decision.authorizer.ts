import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { CustomerSummaryDto } from '../../../customers/application/ports/customer-query.port';
import { GetCustomerByUserIdQuery } from '../../../customers/application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { WorkOrder } from '../../domain/entities/work-order';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';

/**
 * The single place that decides whether an actor may approve or reject a work order's budget.
 * `PermissionsGuard` requires every permission it is given (`.every()`), so it cannot express
 * "the owning customer or a holder of `work-orders:decide`" - that check lives here instead,
 * reached over the `QueryBus` (AD-003). Refusing with `WorkOrderNotFoundError` rather than a
 * forbidden error means the API never confirms a work order number exists to a stranger.
 */
@Injectable()
export class BudgetDecisionAuthorizer {
  constructor(private readonly queryBus: QueryBus) {}

  async assertMayDecide(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(actorUserId),
    );
    if (access.permissions.includes(AppPermission.WorkOrdersDecide)) {
      return;
    }

    const customer = await this.queryBus.execute<
      GetCustomerByUserIdQuery,
      CustomerSummaryDto | null
    >(new GetCustomerByUserIdQuery(actorUserId));
    if (customer && customer.id === workOrder.customerId) {
      return;
    }

    throw new WorkOrderNotFoundError();
  }
}
