import { BaseError } from '../../domain/errors/base.error';
import { ErrorKind } from '../../domain/errors/error-kind';

export class RequestValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly kind = ErrorKind.Validation;

  constructor(readonly details: string[]) {
    super('Request validation failed.');
  }
}
