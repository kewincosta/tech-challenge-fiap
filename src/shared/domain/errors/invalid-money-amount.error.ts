import { DomainError } from './domain.error';
import { ErrorKind } from './error-kind';

export class InvalidMoneyAmountError extends DomainError {
  readonly code = 'MONEY_INVALID_AMOUNT';
  readonly kind = ErrorKind.Validation;

  constructor(value: number) {
    super(`Invalid monetary amount: ${value}`);
  }
}
