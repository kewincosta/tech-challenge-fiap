import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckReadinessUseCase } from './check-readiness.use-case';

type State = 'up' | 'down';

function answering(state: State): () => Promise<void> {
  return () =>
    state === 'up' ? Promise.resolve() : Promise.reject(new Error('connection refused'));
}

function answeringAfter(milliseconds: number): () => Promise<void> {
  return () => new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('Readiness', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports every combination of the two checks', async () => {
    const combinations: Array<{ database: State; redis: State; status: 'ok' | 'error' }> = [
      { database: 'up', redis: 'up', status: 'ok' },
      { database: 'up', redis: 'down', status: 'error' },
      { database: 'down', redis: 'up', status: 'error' },
      { database: 'down', redis: 'down', status: 'error' },
    ];

    for (const { database, redis, status } of combinations) {
      const useCase = new CheckReadinessUseCase({
        database: answering(database),
        redis: answering(redis),
      });

      expect(await useCase.execute(), `database ${database}, redis ${redis}`).toEqual({
        status,
        checks: { database, redis },
      });
    }
  });

  it('gives up on a check after 2 seconds', async () => {
    vi.useFakeTimers();
    const useCase = new CheckReadinessUseCase({
      database: answeringAfter(1900),
      redis: answeringAfter(2100),
    });
    const reported = vi.fn();
    void useCase.execute().then(reported);

    await vi.advanceTimersByTimeAsync(1999);
    expect(
      reported,
      'at 1999 ms the redis check is still inside its 2 seconds',
    ).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(
      reported,
      'at 2000 ms the report no longer waits for the redis check',
    ).toHaveBeenCalledWith({
      status: 'error',
      checks: { database: 'up', redis: 'down' },
    });
  });

  it('counts a check that throws before it returns a promise as down', async () => {
    const useCase = new CheckReadinessUseCase({
      database: () => {
        throw new Error('no pool');
      },
      redis: answering('up'),
    });

    expect(await useCase.execute()).toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'up' },
    });
  });
});
