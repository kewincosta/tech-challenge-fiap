import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

/**
 * Fires for two reasons - an item attached to no budget round, and an item on a round that
 * exists but was not approved - both named so the caller does not have to guess which (H38, spec.md).
 */
export class PartNotWithdrawableError extends DomainError {
  readonly code = 'WORK_ORDER_PART_NOT_WITHDRAWABLE';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('A part can only be withdrawn once its own budget round has been approved.');
  }
}
