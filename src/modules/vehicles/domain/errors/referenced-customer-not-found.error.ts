import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

// Mirrors customers' own CustomerNotFoundError and users' own AssignedUserNotFoundError-style
// pattern: this module defines its own "referenced entity in another module was not found" error
// rather than importing another module's DomainError class (AD-003's boundary applies here too).
export class ReferencedCustomerNotFoundError extends DomainError {
  readonly code = 'VEHICLE_REFERENCED_CUSTOMER_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('The customer this vehicle would belong to was not found.');
  }
}
