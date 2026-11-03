import { describe, expect, it } from 'vitest';
import { DomainEvent } from '../../domain/domain-event';
import { RecordingDomainEventPublisher } from '../../../../test/support/fakes/recording-domain-event-publisher';

class Ticked extends DomainEvent {
  constructor(readonly count: number) {
    super(new Date('2026-01-01T00:00:00Z'));
  }
}

describe('RecordingDomainEventPublisher', () => {
  it('records the events of every publish call, in order', () => {
    const publisher = new RecordingDomainEventPublisher();

    publisher.publish([new Ticked(1), new Ticked(2)]);
    publisher.publish([new Ticked(3)]);

    expect(publisher.published).toEqual([new Ticked(1), new Ticked(2), new Ticked(3)]);
  });
});
