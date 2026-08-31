import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseError } from '../../domain/errors/base.error';
import { ErrorKind } from '../../domain/errors/error-kind';
import { RequestValidationError } from '../errors/request-validation.error';

const KIND_TO_STATUS: Record<ErrorKind, HttpStatus> = {
  [ErrorKind.Validation]: HttpStatus.BAD_REQUEST,
  [ErrorKind.Unauthorized]: HttpStatus.UNAUTHORIZED,
  [ErrorKind.Forbidden]: HttpStatus.FORBIDDEN,
  [ErrorKind.NotFound]: HttpStatus.NOT_FOUND,
  [ErrorKind.Conflict]: HttpStatus.CONFLICT,
  [ErrorKind.RuleViolation]: HttpStatus.UNPROCESSABLE_ENTITY,
};

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'AUTH_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required.',
  [HttpStatus.FORBIDDEN]: 'Insufficient permissions.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests.',
};

interface ErrorBody {
  code: string;
  message: string;
  reference: string;
  details?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string | number }>();
    const reference = String(request.id ?? '');

    if (exception instanceof RequestValidationError) {
      this.reply(response, HttpStatus.BAD_REQUEST, {
        code: exception.code,
        message: exception.message,
        reference,
        details: exception.details,
      });
      return;
    }

    if (exception instanceof BaseError) {
      this.reply(response, KIND_TO_STATUS[exception.kind], {
        code: exception.code,
        message: exception.message,
        reference,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logUnexpected(exception, request);
        this.reply(response, status, {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error.',
          reference,
        });
        return;
      }
      this.reply(response, status, {
        code: STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
        message: STATUS_TO_MESSAGE[status] ?? exception.message,
        reference,
      });
      return;
    }

    this.logUnexpected(exception, request);
    this.reply(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
      reference,
    });
  }

  private reply(response: Response, status: number, body: ErrorBody): void {
    response.status(status).json(body);
  }

  private logUnexpected(exception: unknown, request: Request): void {
    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`Unhandled exception on ${request.method} ${request.url}`, stack);
  }
}
