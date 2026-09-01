import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class WorkOrderItemNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_ITEM_NOT_FOUND';
  readonly kind = ErrorKind.NotFound;

  constructor() {
    super('Work order item not found.');
  }
}
