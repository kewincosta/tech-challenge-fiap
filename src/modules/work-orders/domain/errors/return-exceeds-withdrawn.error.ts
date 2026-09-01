import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class ReturnExceedsWithdrawnError extends DomainError {
  readonly code = 'WORK_ORDER_RETURN_EXCEEDS_WITHDRAWN';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('This return would take the item below zero withdrawn units.');
  }
}
