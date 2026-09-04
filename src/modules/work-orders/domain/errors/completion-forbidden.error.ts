import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class CompletionForbiddenError extends DomainError {
  readonly code = 'WORK_ORDER_COMPLETION_FORBIDDEN';
  readonly kind = ErrorKind.Forbidden;

  constructor() {
    super(
      'Only the assigned mechanic or a holder of work-orders:manage may complete this work order.',
    );
  }
}
