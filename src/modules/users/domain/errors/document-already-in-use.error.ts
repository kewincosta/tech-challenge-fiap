import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class DocumentAlreadyInUseError extends DomainError {
  readonly code = 'USER_DOCUMENT_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Document is already in use.');
  }
}
