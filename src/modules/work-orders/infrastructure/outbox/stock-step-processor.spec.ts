import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboxSettings } from '../../application/outbox-settings';
import { StockStepApplier } from '../../application/services/stock-step-applier';
import { StockStepProcessor } from './stock-step-processor';

const INTERVAL_MS = 5000;

// The processor only asks the applier to apply the due steps. The stand-in counts the runs and
// answers with whatever `behaviour` returns, so a spec can hold a run open or make it fail.
class CountingApplier {
  runs = 0;
  behaviour: () => Promise<void> = () => Promise.resolve();

  applyDue(): Promise<void> {
    this.runs += 1;
    return this.behaviour();
  }
}

function makeProcessor(pollIntervalMs = INTERVAL_MS) {
  const applier = new CountingApplier();
  const settings: OutboxSettings = { pollIntervalMs, graceSeconds: 300, maxAttempts: 10 };
  const processor = new StockStepProcessor(applier as unknown as StockStepApplier, settings);
  return { processor, applier };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StockStepProcessor', () => {
  it('looks for due steps as soon as the application starts', async () => {
    const { processor, applier } = makeProcessor();

    processor.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(applier.runs).toBe(1);
    await processor.onApplicationShutdown();
  });

  it('looks again on every interval', async () => {
    const { processor, applier } = makeProcessor();
    processor.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(applier.runs).toBe(2);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    expect(applier.runs).toBe(4);

    await processor.onApplicationShutdown();
  });

  it('stays off when the interval is 0: no run at the start and no timer', async () => {
    const { processor, applier } = makeProcessor(0);

    processor.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(applier.runs).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not keep the process alive for its timer', () => {
    const { processor } = makeProcessor();

    processor.onApplicationBootstrap();

    const { timer } = processor as unknown as { timer: NodeJS.Timeout };
    expect(timer.hasRef()).toBe(false);
  });

  it('stops looking when the application shuts down', async () => {
    const { processor, applier } = makeProcessor();
    processor.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    await processor.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(applier.runs).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a run that is going before it lets the shutdown finish', async () => {
    const { processor, applier } = makeProcessor();
    let finishRun: () => void = () => undefined;
    applier.behaviour = () =>
      new Promise<void>((resolve) => {
        finishRun = resolve;
      });
    processor.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    let shutDown = false;

    const shutdown = processor.onApplicationShutdown().then(() => {
      shutDown = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(shutDown).toBe(false);
    finishRun();
    await shutdown;

    expect(shutDown).toBe(true);
  });

  it('does not start a run while the previous one is still going', async () => {
    const { processor, applier } = makeProcessor();
    let finishRun: () => void = () => undefined;
    applier.behaviour = () =>
      new Promise<void>((resolve) => {
        finishRun = resolve;
      });
    processor.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(applier.runs).toBe(1);
    finishRun();
    applier.behaviour = () => Promise.resolve();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(applier.runs).toBe(2);
    await processor.onApplicationShutdown();
  });

  it('logs a run that fails and keeps looking on the next interval', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { processor, applier } = makeProcessor();
    const failure = new Error('the database is down');
    applier.behaviour = () => Promise.reject(failure);
    processor.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('Applying the due stock steps failed.', failure);
    expect(error.mock.contexts[0]).toMatchObject({ context: 'StockStepOutbox' });
    applier.behaviour = () => Promise.resolve();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(applier.runs).toBe(2);
    await processor.onApplicationShutdown();
  });
});
