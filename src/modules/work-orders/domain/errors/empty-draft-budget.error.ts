import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class EmptyDraftBudgetError extends DomainError {
  readonly code = 'WORK_ORDER_EMPTY_DRAFT_BUDGET';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super(
      'Add at least one service or part to the draft before submitting a supplementary budget.',
    );
  }
}
