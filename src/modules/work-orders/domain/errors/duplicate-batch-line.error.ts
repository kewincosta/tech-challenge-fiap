import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class DuplicateBatchLineError extends DomainError {
  readonly code = 'WORK_ORDER_DUPLICATE_BATCH_LINE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The same work order item cannot be addressed twice in one call.');
  }
}
