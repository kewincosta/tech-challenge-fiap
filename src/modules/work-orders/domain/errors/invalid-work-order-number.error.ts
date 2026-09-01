import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidWorkOrderNumberError extends DomainError {
  readonly code = 'WORK_ORDER_INVALID_NUMBER';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Work order number must match XXXXXX-YYYY, letters and digits then the year.');
  }
}
