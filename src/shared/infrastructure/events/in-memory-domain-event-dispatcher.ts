import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEventPublisher,
  DomainEventSubscriber,
} from '../../application/ports/domain-event-publisher.port';
import { DomainEvent } from '../../domain/domain-event';

type DomainEventType<E extends DomainEvent> = new (...args: never[]) => E;

/**
 * Hands each event to the subscribers of its class and never waits for them. A subscriber starts
 * during `publish`. One that throws or rejects is logged at error level, under the `EventBus`
 * context, and never reaches the caller.
 */
@Injectable()
export class InMemoryDomainEventDispatcher implements DomainEventPublisher {
  private readonly logger = new Logger('EventBus');
  private readonly subscribers = new Map<object, DomainEventSubscriber[]>();

  subscribe<E extends DomainEvent>(
    eventType: DomainEventType<E>,
    subscriber: DomainEventSubscriber<E>,
  ): void {
    this.subscribers.set(eventType, [...(this.subscribers.get(eventType) ?? []), subscriber]);
  }

  publish(events: DomainEvent[]): void {
    for (const event of events) {
      for (const subscriber of this.subscribers.get(event.constructor) ?? []) {
        this.start(subscriber, event);
      }
    }
  }

  private start(subscriber: DomainEventSubscriber, event: DomainEvent): void {
    try {
      Promise.resolve(subscriber.handle(event)).catch((error: unknown) => {
        this.report(subscriber, error);
      });
    } catch (error) {
      this.report(subscriber, error);
    }
  }

  // The wording and the context stay as logged before, so a search over old logs still matches.
  // The old line printed "InstanceWrapper" where this one prints the subscriber's class name.
  private report(subscriber: DomainEventSubscriber, error: unknown): void {
    this.logger.error(`"${subscriber.constructor.name}" has thrown an unhandled exception.`, error);
  }
}
