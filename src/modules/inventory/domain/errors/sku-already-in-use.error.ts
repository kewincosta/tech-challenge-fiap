import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class SkuAlreadyInUseError extends DomainError {
  readonly code = 'INVENTORY_SKU_ALREADY_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Another active item already uses this SKU.');
  }
}
