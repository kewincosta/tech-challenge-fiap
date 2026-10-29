import { Inject, Injectable } from '@nestjs/common';
import { WORK_ORDER_ACTORS } from '../../work-orders.tokens';
import { WorkOrder } from '../../domain/entities/work-order';
import { CancelInExecutionForbiddenError } from '../../domain/errors/cancel-in-execution-forbidden.error';
import { WorkOrderActors } from '../ports/work-order-actors.port';

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
  constructor(@Inject(WORK_ORDER_ACTORS) private readonly actors: WorkOrderActors) {}

  async assertMayCancel(workOrder: WorkOrder, actorUserId: string): Promise<void> {
    if (!workOrder.hasOutstandingWithdrawals) {
      return;
    }
    const capabilities = await this.actors.capabilitiesOf(actorUserId);
    if (capabilities.cancelsInExecution) {
      return;
    }
    throw new CancelInExecutionForbiddenError();
  }
}
