import { CommandBus, EventBus, QueryBus } from '@nestjs/cqrs';
import { Mock, vi } from 'vitest';

export interface EventBusStub {
  bus: EventBus;
  publish: Mock;
  publishAll: Mock;
}

export function stubEventBus(): EventBusStub {
  const publish = vi.fn();
  const publishAll = vi.fn();
  return { bus: { publish, publishAll } as unknown as EventBus, publish, publishAll };
}

export interface CommandBusStub {
  bus: CommandBus;
  execute: Mock;
}

export function stubCommandBus(): CommandBusStub {
  const execute = vi.fn();
  return { bus: { execute } as unknown as CommandBus, execute };
}

export interface QueryBusStub {
  bus: QueryBus;
  execute: Mock;
}

export function stubQueryBus(): QueryBusStub {
  const execute = vi.fn();
  return { bus: { execute } as unknown as QueryBus, execute };
}
