import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Principal } from '../principal';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    if (!request.principal) {
      throw new UnauthorizedException();
    }
    return request.principal;
  },
);
