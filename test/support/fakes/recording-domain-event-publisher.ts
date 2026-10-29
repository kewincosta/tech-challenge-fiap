import { DomainEventPublisher } from '../../../src/shared/application/ports/domain-event-publisher.port';
import { DomainEvent } from '../../../src/shared/domain/domain-event';

export class RecordingDomainEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  publish(events: DomainEvent[]): void {
    this.published.push(...events);
  }
}
