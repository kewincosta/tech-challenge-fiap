import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { WorkOrderStatus } from '../work-order-status';

export class WorkOrderStateError extends DomainError {
  readonly code = 'WORK_ORDER_INVALID_STATE';
  readonly kind = ErrorKind.RuleViolation;

  constructor(readonly currentStatus: WorkOrderStatus) {
    super(`This action is not allowed while the work order is ${currentStatus}.`);
  }
}
