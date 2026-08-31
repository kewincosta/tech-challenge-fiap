import { DomainError } from './domain.error';
import { ErrorKind } from './error-kind';

export class InvalidIdError extends DomainError {
  readonly code = 'INVALID_ID';
  readonly kind = ErrorKind.Validation;

  constructor(value: string) {
    super(`Invalid identifier: ${value}`);
  }
}
