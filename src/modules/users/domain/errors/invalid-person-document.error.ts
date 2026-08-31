import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidPersonDocumentError extends DomainError {
  readonly code = 'USER_INVALID_DOCUMENT';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid CPF or CNPJ.');
  }
}
