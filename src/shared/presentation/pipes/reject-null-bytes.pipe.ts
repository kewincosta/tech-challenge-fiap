import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { RequestValidationError } from '../errors/request-validation.error';

/**
 * Refuses any input carrying a NUL character, before it reaches a query.
 *
 * PostgreSQL cannot store or compare `\0` inside a text value and answers with an error, which
 * surfaces as a 500 and an "Internal server error" body. The assessment's dynamic scan found this
 * on four list routes at once (`?name=%00`, `?role=%00`, `?kind=%00`), so the fix belongs where
 * every route passes rather than on each filter.
 *
 * A NUL byte has no legitimate use in a document number, a name or a status filter, so refusing
 * it outright is the honest answer: a 400 that names the problem, instead of a 500 that leaks
 * that something broke downstream.
 */
@Injectable()
export class RejectNullBytesPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (containsNullByte(value)) {
      throw new RequestValidationError([
        `${metadata.data ?? 'input'} must not contain a NUL character.`,
      ]);
    }
    return value;
  }
}

/** Walks strings, arrays and plain objects; anything else cannot carry the character. */
function containsNullByte(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('\0');
  }
  if (Array.isArray(value)) {
    return value.some(containsNullByte);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(containsNullByte);
  }
  return false;
}
