import { DomainEvent } from './domain-event';

export abstract class AggregateRoot {
  private events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const pulled = this.events;
    this.events = [];
    return pulled;
  }

  /**
   * Non-draining: reading this twice returns the same events. A repository that writes a trail
   * from the aggregate's own recorded events (AD-007) needs to read them without emptying the
   * list the publisher still drains through `pullDomainEvents` after `save` returns (H39).
   */
  get domainEvents(): readonly DomainEvent[] {
    return [...this.events];
  }
}
