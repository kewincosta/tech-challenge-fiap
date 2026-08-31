import { ValidationError, ValidationPipe } from '@nestjs/common';
import { RequestValidationError } from '../errors/request-validation.error';

export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new RequestValidationError(flattenValidationErrors(errors)),
  });
}

function flattenValidationErrors(errors: ValidationError[]): string[] {
  const details: string[] = [];
  const walk = (error: ValidationError): void => {
    if (error.constraints) {
      details.push(...Object.values(error.constraints));
    }
    (error.children ?? []).forEach(walk);
  };
  errors.forEach(walk);
  return details;
}
