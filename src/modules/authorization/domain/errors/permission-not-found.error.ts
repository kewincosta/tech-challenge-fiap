import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class PermissionNotFoundError extends DomainError {
  readonly code = 'PERMISSION_NOT_FOUND';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('One or more permissions do not exist.');
  }
}
