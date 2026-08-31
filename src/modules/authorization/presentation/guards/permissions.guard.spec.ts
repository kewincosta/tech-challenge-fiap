import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { FakeAccessCache } from '../../../../../test/support/fakes/fake-access-cache';
import { EffectiveAccessDto } from '../../application/dtos/effective-access.dto';
import { EffectiveAccessService } from '../../application/services/effective-access.service';
import { PermissionsGuard } from './permissions.guard';

const USER_ID = '11111111-1111-4111-8111-111111111111';

interface GuardSetup {
  requiredPermissions?: string[];
  requiredRoles?: string[];
  access?: EffectiveAccessDto;
  authenticated?: boolean;
}

function makeContext(authenticated: boolean): ExecutionContext {
  const request = authenticated
    ? { principal: { userId: USER_ID, sessionId: '22222222-2222-4222-8222-222222222222' } }
    : {};
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard(setup: GuardSetup) {
  const reflector = {
    getAllAndOverride: vi
      .fn()
      .mockReturnValueOnce(setup.requiredPermissions)
      .mockReturnValueOnce(setup.requiredRoles),
  } as unknown as Reflector;
  const service = new EffectiveAccessService(new FakeAccessCache(), {
    read: () =>
      Promise.resolve(setup.access ?? { roles: [], permissions: [] }),
  });
  return {
    guard: new PermissionsGuard(reflector, service),
    context: makeContext(setup.authenticated ?? true),
  };
}

describe('PermissionsGuard', () => {
  it('should allow a route without permission or role metadata', async () => {
    const { guard, context } = makeGuard({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should allow a user holding every required permission', async () => {
    const { guard, context } = makeGuard({
      requiredPermissions: ['users:read'],
      access: { roles: ['ADMIN'], permissions: ['users:read', 'roles:read'] },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should deny a user missing one of the required permissions', async () => {
    const { guard, context } = makeGuard({
      requiredPermissions: ['users:read', 'roles:manage'],
      access: { roles: ['CUSTOMER'], permissions: ['users:read'] },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should deny a user without any of the required roles', async () => {
    const { guard, context } = makeGuard({
      requiredRoles: ['ADMIN'],
      access: { roles: ['CUSTOMER'], permissions: [] },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should deny an unauthenticated request on a protected route', async () => {
    const { guard, context } = makeGuard({
      requiredPermissions: ['users:read'],
      authenticated: false,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
