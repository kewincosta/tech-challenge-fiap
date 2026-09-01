import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { WorkOrder } from '../../domain/entities/work-order';
import { CompletionForbiddenError } from '../../domain/errors/completion-forbidden.error';

/**
 * The single place that decides whether an actor may complete a work order. The state machine
 * names "the assigned mechanic or an administrator", which `PermissionsGuard.every()` cannot
 * express - checked here instead, reached over the `QueryBus` (AD-003), mirroring
 * `BudgetDecisionAuthorizer`'s shape. Unlike that authorizer, this one refuses with a forbidden
 * error rather than a not-found one: every actor able to reach the completion route already holds
 * `work-orders:read`, so the work order's existence is not a secret from them.
 */
@Injectable()
export class WorkOrderCompletionAuthorizer {
  constructor(private readonly queryBus: QueryBus) {}

  async assertMayComplete(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(actorUserId),
    );
    if (access.permissions.includes(AppPermission.WorkOrdersManage)) {
      return;
    }
    if (workOrder.assignedMechanicUserId === actorUserId) {
      return;
    }
    throw new CompletionForbiddenError();
  }
}
