import { DomainEvent } from '../../../../shared/domain/domain-event';

export class RefreshTokenReuseDetected extends DomainEvent {
  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly tokenId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
