import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class DiagnosisWithoutItemsError extends DomainError {
  readonly code = 'WORK_ORDER_DIAGNOSIS_WITHOUT_ITEMS';
  readonly kind = ErrorKind.RuleViolation;

  constructor() {
    super('Add at least one service or part before completing the diagnosis.');
  }
}
