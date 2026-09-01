import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

/**
 * Never surfaced over HTTP: `CreateWorkOrderHandler` catches this and draws another number
 * (design.md's Error Handling). A collision is expected, not exceptional - the number is random.
 */
export class WorkOrderNumberTakenError extends DomainError {
  readonly code = 'WORK_ORDER_NUMBER_TAKEN';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Work order number already taken.');
  }
}
