import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefreshTokenReuseDetected } from '../../domain/events/refresh-token-reuse-detected.event';
import { RefreshTokenReuseSubscriber } from './security-events.subscriber';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RefreshTokenReuseSubscriber', () => {
  it('warns that the refresh token of the session was reused and the session revoked, under AuthenticationSecurity', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const subscriber = new RefreshTokenReuseSubscriber();

    subscriber.handle(
      new RefreshTokenReuseDetected(
        SESSION_ID,
        USER_ID,
        TOKEN_ID,
        new Date('2026-09-01T09:00:00Z'),
      ),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `Refresh token reuse detected for session ${SESSION_ID}; the session was revoked.`,
    );
    expect(warn.mock.contexts[0]).toMatchObject({ context: 'AuthenticationSecurity' });
  });
});
