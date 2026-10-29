import { DomainEvent } from '../../domain/domain-event';

/** Hands the events an aggregate recorded to whoever listens. It never waits for a subscriber. */
export interface DomainEventPublisher {
  publish(events: DomainEvent[]): void;
}

export interface DomainEventSubscriber<E extends DomainEvent = DomainEvent> {
  handle(event: E): void | Promise<void>;
}
