import { DomainEvent } from '../../../../shared/domain/domain-event';
import { SessionRevocationReason } from '../session-revocation-reason';

export class AllUserSessionsRevoked extends DomainEvent {
  constructor(
    readonly userId: string,
    readonly sessionIds: string[],
    readonly reason: SessionRevocationReason,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
