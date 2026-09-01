import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { WorkOrder } from '../../domain/entities/work-order';
import { CancelInExecutionForbiddenError } from '../../domain/errors/cancel-in-execution-forbidden.error';

/**
 * `work-orders:cancel` alone is enough unless the work order carries an outstanding withdrawn
 * part, in which case `work-orders:cancel-in-execution` is also required. Keyed on
 * `hasOutstandingWithdrawals`, not on the work order's state - H38 opened `AWAITING_APPROVAL` to
 * a work order that already withdrew parts on an earlier round, so H36's state list no longer
 * covers every case its own reason (parts already withdrawn become a loss) applies to
 * (spec.md's Assumptions).
 */
@Injectable()
export class CancellationAuthorizer {
  constructor(private readonly queryBus: QueryBus) {}

  async assertMayCancel(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    if (!workOrder.hasOutstandingWithdrawals) {
      return;
    }
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(actorUserId),
    );
    if (access.permissions.includes(AppPermission.WorkOrdersCancelInExecution)) {
      return;
    }
    throw new CancelInExecutionForbiddenError();
  }
}
