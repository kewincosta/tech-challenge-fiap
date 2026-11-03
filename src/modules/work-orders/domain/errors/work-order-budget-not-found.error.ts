import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class WorkOrderBudgetNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_BUDGET_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Budget not found on this work order.');
  }
}
