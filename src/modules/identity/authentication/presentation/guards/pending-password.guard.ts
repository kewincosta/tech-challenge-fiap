import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PasswordChangeRequiredError } from '../../domain/errors/password-change-required.error';
import { ALLOWS_PENDING_PASSWORD_KEY } from '../decorators/allows-pending-password.decorator';
import { Principal } from '../principal';

@Injectable()
export class PendingPasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    // No principal means an unauthenticated (@Public()) route - JwtAuthGuard already let it
    // through without touching request.principal, so there is nothing to gate here.
    if (!request.principal) {
      return true;
    }
    if (!request.principal.mustChangePassword) {
      return true;
    }
    const allowsPendingPassword = this.reflector.getAllAndOverride<boolean>(
      ALLOWS_PENDING_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowsPendingPassword) {
      return true;
    }
    throw new PasswordChangeRequiredError();
  }
}
