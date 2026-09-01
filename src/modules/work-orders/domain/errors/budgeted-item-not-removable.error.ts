import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class BudgetedItemNotRemovableError extends DomainError {
  readonly code = 'WORK_ORDER_BUDGETED_ITEM_NOT_REMOVABLE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('An item already attached to a budget round cannot be removed.');
  }
}
