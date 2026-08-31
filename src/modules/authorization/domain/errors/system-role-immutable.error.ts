import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class SystemRoleImmutableError extends DomainError {
  readonly code = 'ROLE_SYSTEM_IMMUTABLE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('System roles cannot be renamed or deleted.');
  }
}
