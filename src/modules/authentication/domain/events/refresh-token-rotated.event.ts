import { DomainEvent } from '../../../../shared/domain/domain-event';

export class RefreshTokenRotated extends DomainEvent {
  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly rotatedTokenId: string,
    readonly newTokenId: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
