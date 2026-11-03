import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainEventSubscriber } from '../../application/ports/domain-event-publisher.port';
import { DomainEvent } from '../../domain/domain-event';
import { InMemoryDomainEventDispatcher } from './in-memory-domain-event-dispatcher';

class OrderPlaced extends DomainEvent {
  constructor(readonly orderId: string) {
    super(new Date('2026-01-01T00:00:00Z'));
  }
}

class OrderCancelled extends DomainEvent {
  constructor(readonly orderId: string) {
    super(new Date('2026-01-01T00:00:00Z'));
  }
}

class LoggingSubscriber implements DomainEventSubscriber<OrderPlaced | OrderCancelled> {
  constructor(
    private readonly label: string,
    private readonly log: string[],
  ) {}

  handle(event: OrderPlaced | OrderCancelled): void {
    this.log.push(`${this.label}:${event.orderId}`);
  }
}

class ThrowingSubscriber implements DomainEventSubscriber<OrderPlaced> {
  readonly failure = new Error('the subscriber broke');

  handle(): void {
    throw this.failure;
  }
}

class RejectingSubscriber implements DomainEventSubscriber<OrderPlaced> {
  readonly failure = new Error('the subscriber rejected');

  async handle(): Promise<void> {
    return Promise.reject(this.failure);
  }
}

class SlowSubscriber implements DomainEventSubscriber<OrderPlaced> {
  started = false;
  settled = false;
  private finish: () => void = () => undefined;

  async handle(): Promise<void> {
    this.started = true;
    await new Promise<void>((resolve) => {
      this.finish = resolve;
    });
    this.settled = true;
  }

  release(): void {
    this.finish();
  }
}

// Lets the callbacks of a promise that is already rejected or resolved run.
const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InMemoryDomainEventDispatcher', () => {
  it('starts a subscriber during publish', () => {
    const dispatcher = new InMemoryDomainEventDispatcher();
    const log: string[] = [];
    dispatcher.subscribe(OrderPlaced, new LoggingSubscriber('first', log));

    dispatcher.publish([new OrderPlaced('order-1')]);

    expect(log).toEqual(['first:order-1']);
  });

  it('returns before an async subscriber settles', async () => {
    const dispatcher = new InMemoryDomainEventDispatcher();
    const subscriber = new SlowSubscriber();
    dispatcher.subscribe(OrderPlaced, subscriber);

    const returned: unknown = dispatcher.publish([new OrderPlaced('order-1')]);

    expect(returned).toBeUndefined();
    expect(subscriber.started).toBe(true);
    expect(subscriber.settled).toBe(false);
    subscriber.release();
    await flushPromises();
    expect(subscriber.settled).toBe(true);
  });

  it('logs a synchronous throw as "<SubscriberName>" has thrown an unhandled exception., keeps the caller out of it and still reaches the next subscriber', () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dispatcher = new InMemoryDomainEventDispatcher();
    const throwing = new ThrowingSubscriber();
    const log: string[] = [];
    dispatcher.subscribe(OrderPlaced, throwing);
    dispatcher.subscribe(OrderPlaced, new LoggingSubscriber('next', log));

    expect(() => dispatcher.publish([new OrderPlaced('order-1')])).not.toThrow();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      '"ThrowingSubscriber" has thrown an unhandled exception.',
      throwing.failure,
    );
    expect(errorLog.mock.contexts[0]).toMatchObject({ context: 'EventBus' });
    expect(log).toEqual(['next:order-1']);
  });

  it('logs a rejected promise as "<SubscriberName>" has thrown an unhandled exception., keeps the caller out of it and still reaches the next subscriber', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dispatcher = new InMemoryDomainEventDispatcher();
    const rejecting = new RejectingSubscriber();
    const log: string[] = [];
    dispatcher.subscribe(OrderPlaced, rejecting);
    dispatcher.subscribe(OrderPlaced, new LoggingSubscriber('next', log));

    expect(() => dispatcher.publish([new OrderPlaced('order-1')])).not.toThrow();
    await flushPromises();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      '"RejectingSubscriber" has thrown an unhandled exception.',
      rejecting.failure,
    );
    expect(errorLog.mock.contexts[0]).toMatchObject({ context: 'EventBus' });
    expect(log).toEqual(['next:order-1']);
  });

  it('runs only the subscribers of the class of each event, in publish order', () => {
    const dispatcher = new InMemoryDomainEventDispatcher();
    const log: string[] = [];
    dispatcher.subscribe(OrderPlaced, new LoggingSubscriber('placed', log));
    dispatcher.subscribe(OrderCancelled, new LoggingSubscriber('cancelled', log));
    dispatcher.subscribe(OrderPlaced, new LoggingSubscriber('also-placed', log));

    dispatcher.publish([new OrderPlaced('a'), new OrderCancelled('b'), new OrderPlaced('c')]);

    expect(log).toEqual(['placed:a', 'also-placed:a', 'cancelled:b', 'placed:c', 'also-placed:c']);
  });
});
