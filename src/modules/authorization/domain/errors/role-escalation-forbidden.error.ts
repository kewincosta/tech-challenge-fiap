import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class RoleEscalationForbiddenError extends DomainError {
  readonly code = 'AUTHZ_ROLE_ESCALATION_FORBIDDEN';
  readonly kind = ErrorKind.Forbidden;

  constructor() {
    super('Only a super administrator can assign the administrator role.');
  }
}
