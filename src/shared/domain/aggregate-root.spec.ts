import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root';
import { DomainEvent } from './domain-event';

class TestEvent extends DomainEvent {
  constructor(
    readonly payload: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}

class TestAggregate extends AggregateRoot {
  recordOne(payload: string): void {
    this.record(new TestEvent(payload, new Date('2026-08-31T12:00:00.000Z')));
  }
}

describe('AggregateRoot', () => {
  it('should return every recorded event from domainEvents', () => {
    const aggregate = new TestAggregate();
    aggregate.recordOne('a');
    aggregate.recordOne('b');

    const events = aggregate.domainEvents;

    expect(events).toHaveLength(2);
    expect((events[0] as TestEvent).payload).toBe('a');
    expect((events[1] as TestEvent).payload).toBe('b');
  });

  it('should return the same events when domainEvents is read twice, proving it does not drain', () => {
    const aggregate = new TestAggregate();
    aggregate.recordOne('a');

    const first = aggregate.domainEvents;
    const second = aggregate.domainEvents;

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('should still let pullDomainEvents return the events and empty the list after domainEvents was read', () => {
    const aggregate = new TestAggregate();
    aggregate.recordOne('a');
    const readBeforePull = aggregate.domainEvents;
    expect(readBeforePull).toHaveLength(1);

    const pulled = aggregate.pullDomainEvents();

    expect(pulled).toHaveLength(1);
    expect(aggregate.pullDomainEvents()).toHaveLength(0);
  });
});
