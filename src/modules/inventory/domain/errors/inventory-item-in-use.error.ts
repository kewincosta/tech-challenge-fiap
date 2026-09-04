import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

/**
 * Carries the work order numbers so the caller can act on the refusal without a second lookup -
 * the same reason the shortage read model returns `workOrderNumbers` rather than a bare count.
 */
export class InventoryItemInUseError extends DomainError {
  readonly code = 'INVENTORY_ITEM_IN_USE';
  readonly kind = ErrorKind.Conflict;

  constructor(readonly workOrderNumbers: string[]) {
    super(`This item is planned on an open work order: ${workOrderNumbers.join(', ')}.`);
  }
}
