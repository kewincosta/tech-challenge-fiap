import { ErrorKind } from './error-kind';

export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly kind: ErrorKind;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
