import { DomainEvent } from '../../../../shared/domain/domain-event';
import { SessionRevocationReason } from '../session-revocation-reason';

export class SessionRevoked extends DomainEvent {
  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly reason: SessionRevocationReason,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
