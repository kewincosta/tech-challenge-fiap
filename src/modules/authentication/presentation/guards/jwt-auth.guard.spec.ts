import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { FakeAccessTokenService } from '../../../../../test/support/fakes/fake-access-token.service';
import { FakeRevokedSessionStore } from '../../../../../test/support/fakes/fake-revoked-session-store';
import { Principal } from '../principal';
import { JwtAuthGuard } from './jwt-auth.guard';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function makeContext(authorization?: string) {
  const request = { headers: authorization ? { authorization } : {} } as Request & {
    principal?: Principal;
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeGuard(isPublic = false) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const revokedSessions = new FakeRevokedSessionStore();
  const guard = new JwtAuthGuard(reflector, new FakeAccessTokenService(), revokedSessions);
  return { guard, revokedSessions };
}

describe('JwtAuthGuard', () => {
  it('should attach the principal for a valid bearer token', async () => {
    const { guard } = makeGuard();
    const { context, request } = makeContext(`Bearer token:${USER_ID}:${SESSION_ID}:false`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.principal).toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      mustChangePassword: false,
    });
  });

  it('should carry a pending password flag onto the principal', async () => {
    const { guard } = makeGuard();
    const { context, request } = makeContext(`Bearer token:${USER_ID}:${SESSION_ID}:true`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.principal?.mustChangePassword).toBe(true);
  });

  it('should allow a public route without a token', async () => {
    const { guard } = makeGuard(true);
    const { context } = makeContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should reject a request without an authorization header', async () => {
    const { guard } = makeGuard();
    const { context } = makeContext();

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a token that fails verification', async () => {
    const { guard } = makeGuard();
    const { context } = makeContext('Bearer tampered-token');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a token whose session was revoked', async () => {
    const { guard, revokedSessions } = makeGuard();
    await revokedSessions.add(SESSION_ID);
    const { context } = makeContext(`Bearer token:${USER_ID}:${SESSION_ID}:false`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
