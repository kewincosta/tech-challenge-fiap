import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

// Mirrors AssignedUserNotFoundError in the authorization module: each module defines its own
// "the referenced entity in another module was not found" error rather than importing another
// module's DomainError class (AD-003's boundary applies to domain errors too, not just repositories).
export class TargetUserNotFoundError extends DomainError {
  readonly code = 'CUSTOMER_TARGET_USER_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('The user to register as a customer was not found.');
  }
}
