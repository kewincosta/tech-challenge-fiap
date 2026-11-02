import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class WorkOrderBudgetLinkOutdatedError extends DomainError {
  readonly code = 'WORK_ORDER_BUDGET_LINK_OUTDATED';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super(
      'This link is not the current one of the budget. The budget was generated again after it was sent.',
    );
  }
}
