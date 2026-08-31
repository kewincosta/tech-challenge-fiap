import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidGroupNameError extends DomainError {
  readonly code = 'GROUP_INVALID_NAME';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Group name must have between 2 and 100 characters.');
  }
}
