import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PasswordChangeRequiredError } from '../../domain/errors/password-change-required.error';
import { Principal } from '../principal';
import { PendingPasswordGuard } from './pending-password.guard';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function makeContext(principal?: Principal): ExecutionContext {
  const request = { principal };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard(allowsPendingPassword: boolean) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(allowsPendingPassword),
  } as unknown as Reflector;
  return new PendingPasswordGuard(reflector);
}

describe('PendingPasswordGuard', () => {
  it('should allow a route with no principal (a @Public() route)', () => {
    const guard = makeGuard(false);

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('should allow a route when the flag is clear', () => {
    const guard = makeGuard(false);
    const principal: Principal = { userId: USER_ID, sessionId: SESSION_ID, mustChangePassword: false };

    expect(guard.canActivate(makeContext(principal))).toBe(true);
  });

  it('should allow the exempted route while the flag is set', () => {
    const guard = makeGuard(true);
    const principal: Principal = { userId: USER_ID, sessionId: SESSION_ID, mustChangePassword: true };

    expect(guard.canActivate(makeContext(principal))).toBe(true);
  });

  it('should refuse every other route while the flag is set', () => {
    const guard = makeGuard(false);
    const principal: Principal = { userId: USER_ID, sessionId: SESSION_ID, mustChangePassword: true };

    expect(() => guard.canActivate(makeContext(principal))).toThrow(PasswordChangeRequiredError);
  });

  it('should refuse with the exact AUTH_PASSWORD_CHANGE_REQUIRED code', () => {
    const guard = makeGuard(false);
    const principal: Principal = { userId: USER_ID, sessionId: SESSION_ID, mustChangePassword: true };

    try {
      guard.canActivate(makeContext(principal));
      expect.unreachable('canActivate should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordChangeRequiredError);
      expect((error as PasswordChangeRequiredError).code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('should check the exemption at both the handler and the class level', () => {
    const guard = makeGuard(true);
    const principal: Principal = { userId: USER_ID, sessionId: SESSION_ID, mustChangePassword: true };
    const context = makeContext(principal);

    guard.canActivate(context);

    const reflector = (guard as unknown as { reflector: { getAllAndOverride: ReturnType<typeof vi.fn> } })
      .reflector;
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(expect.any(String), [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
