import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ServiceInactiveError extends DomainError {
  readonly code = 'WORK_ORDER_SERVICE_INACTIVE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('This service is deactivated.');
  }
}
