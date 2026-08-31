import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class InvalidPhoneNumberError extends DomainError {
  readonly code = 'CUSTOMER_INVALID_PHONE_NUMBER';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('Invalid phone number.');
  }
}
