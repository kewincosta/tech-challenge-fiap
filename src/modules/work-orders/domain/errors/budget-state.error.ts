import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { BudgetStatus } from '../budget-status';

/**
 * A defensive guard on `Budget` itself. `WorkOrder` only ever calls `approve`/`reject` on the
 * round its own `pendingBudget()` lookup found, so this never surfaces through the aggregate
 * today - it exists so the entity's own invariant holds even if a future caller stops going
 * through that lookup.
 */
export class BudgetStateError extends DomainError {
  readonly code = 'BUDGET_INVALID_STATE';
  readonly kind = ErrorKind.RuleViolation;

  constructor(readonly currentStatus: BudgetStatus) {
    super(`This action is not allowed while the budget round is ${currentStatus}.`);
  }
}
