import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

/**
 * H36's named refusal, verbatim: a work order carrying an outstanding withdrawn part needs
 * `work-orders:cancel-in-execution`, held only by an administrator, because those parts become a
 * loss. Keyed on outstanding consumption rather than on `IN_EXECUTION` alone - H38 opened
 * `AWAITING_APPROVAL` to a work order that already withdrew parts on an earlier round, so the
 * state list H36 named no longer covers every case its own reason applies to.
 */
export class CancelInExecutionForbiddenError extends DomainError {
  readonly code = 'WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN';
  readonly kind = ErrorKind.Forbidden;

  constructor() {
    super(
      'This work order has parts already withdrawn, which would be written off as a loss. ' +
        'Only a holder of work-orders:cancel-in-execution may cancel it.',
    );
  }
}
