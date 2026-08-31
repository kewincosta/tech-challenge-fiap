import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidPermissionCodeError extends DomainError {
  readonly code = 'PERMISSION_INVALID_CODE';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Permission code must follow the resource:action format in lowercase.');
  }
}
