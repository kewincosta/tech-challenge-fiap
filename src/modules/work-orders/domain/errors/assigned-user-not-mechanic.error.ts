import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class AssignedUserNotMechanicError extends DomainError {
  readonly code = 'WORK_ORDER_ASSIGNED_USER_NOT_MECHANIC';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('The target user does not hold the MECHANIC role.');
  }
}
