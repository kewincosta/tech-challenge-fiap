import { HttpException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../domain/errors/domain.error';
import { ErrorKind } from '../../domain/errors/error-kind';
import { RequestValidationError } from '../errors/request-validation.error';
import { GlobalExceptionFilter } from './global-exception.filter';

class SampleConflictError extends DomainError {
  readonly code = 'SAMPLE_CONFLICT';
  readonly kind = ErrorKind.Conflict;

  constructor() {
    super('Sample conflict.');
  }
}

function makeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ id: 'req-1', method: 'GET', url: '/api/v1/users/me' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  it('should map a domain error to its http status and code', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost();

    filter.catch(new SampleConflictError(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      code: 'SAMPLE_CONFLICT',
      message: 'Sample conflict.',
      reference: 'req-1',
    });
  });

  it('should return the validation details for a request validation error', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost();

    filter.catch(new RequestValidationError(['email must be an email']), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      reference: 'req-1',
      details: ['email must be an email'],
    });
  });

  it('should return a generic message for an unexpected error', () => {
    const filter = new GlobalExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const { host, status, json } = makeHost();

    filter.catch(new Error('connection to 10.0.0.1:5432 refused'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      reference: 'req-1',
    });
  });

  it('should not expose the message of an internal http exception', () => {
    const filter = new GlobalExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const { host, json } = makeHost();

    filter.catch(new InternalServerErrorException('database pool exhausted'), host);

    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      reference: 'req-1',
    });
  });

  it('should map an unauthorized http exception to a generic message', () => {
    const filter = new GlobalExceptionFilter();
    const { host, status, json } = makeHost();

    filter.catch(new HttpException('no token', HttpStatus.UNAUTHORIZED), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(json).toHaveBeenCalledWith({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Authentication is required.',
      reference: 'req-1',
    });
  });
});
