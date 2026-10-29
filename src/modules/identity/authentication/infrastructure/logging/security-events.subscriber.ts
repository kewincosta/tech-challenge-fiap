import { Injectable, Logger } from '@nestjs/common';
import { DomainEventSubscriber } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { RefreshTokenReuseDetected } from '../../domain/events/refresh-token-reuse-detected.event';

@Injectable()
export class RefreshTokenReuseSubscriber implements DomainEventSubscriber<RefreshTokenReuseDetected> {
  private readonly logger = new Logger('AuthenticationSecurity');

  handle(event: RefreshTokenReuseDetected): void {
    this.logger.warn(
      `Refresh token reuse detected for session ${event.sessionId}; the session was revoked.`,
    );
  }
}
