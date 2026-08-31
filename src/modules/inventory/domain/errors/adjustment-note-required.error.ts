import { DomainError } from '../../../../shared/domain/errors/domain.error';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';

export class AdjustmentNoteRequiredError extends DomainError {
  readonly code = 'INVENTORY_ADJUSTMENT_NOTE_REQUIRED';
  readonly kind = ErrorKind.Validation;

  constructor() {
    super('An adjustment must carry a note explaining it.');
  }
}
