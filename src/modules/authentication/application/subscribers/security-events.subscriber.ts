import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { RefreshTokenReuseDetected } from '../../domain/events/refresh-token-reuse-detected.event';

@EventsHandler(RefreshTokenReuseDetected)
export class RefreshTokenReuseSubscriber implements IEventHandler<RefreshTokenReuseDetected> {
  private readonly logger = new Logger('AuthenticationSecurity');

  handle(event: RefreshTokenReuseDetected): void {
    this.logger.warn(
      `Refresh token reuse detected for session ${event.sessionId}; the session was revoked.`,
    );
  }
}
