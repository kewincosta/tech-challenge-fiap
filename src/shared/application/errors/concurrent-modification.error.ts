import { ErrorKind } from '../../domain/errors/error-kind';
import { ApplicationError } from './application.error';

/**
 * AD-009: a repository's `save` throws this when the row it tried to update no longer carries
 * the version it was loaded at - another write landed first. Reachable by any module that
 * adopts the same version-guarded write, not only `work-orders`.
 */
export class ConcurrentModificationError extends ApplicationError {
  readonly code = 'CONCURRENT_MODIFICATION';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('This record was modified by another request. Reload it and try again.');
  }
}
