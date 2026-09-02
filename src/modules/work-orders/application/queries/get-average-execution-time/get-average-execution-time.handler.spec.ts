import { describe, expect, it, vi } from 'vitest';
import {
  AverageExecutionTimeAggregate,
  WorkOrderMetricsQueryPort,
} from '../../ports/work-order-metrics-query.port';
import { GetAverageExecutionTimeHandler } from './get-average-execution-time.handler';
import { GetAverageExecutionTimeQuery } from './get-average-execution-time.query';

function fakePort(result: AverageExecutionTimeAggregate): WorkOrderMetricsQueryPort {
  return { averageExecutionTime: vi.fn().mockResolvedValue(result) };
}

describe('GetAverageExecutionTimeHandler', () => {
  it('passes the service filter and both date bounds through to the port untouched', async () => {
    const metricsQuery = fakePort({ averageSeconds: 0, workOrderCount: 0 });
    const handler = new GetAverageExecutionTimeHandler(metricsQuery);
    const serviceId = '11111111-1111-4111-8111-111111111111';
    const completedFrom = new Date('2026-01-01T00:00:00Z');
    const completedTo = new Date('2026-01-31T00:00:00Z');

    await handler.execute(new GetAverageExecutionTimeQuery(serviceId, completedFrom, completedTo));

    expect(metricsQuery.averageExecutionTime).toHaveBeenCalledWith({
      serviceId,
      completedFrom,
      completedTo,
    });
  });

  it('marks the response approximated only when a service filter was given', async () => {
    const metricsQuery = fakePort({ averageSeconds: 3600, workOrderCount: 1 });
    const handler = new GetAverageExecutionTimeHandler(metricsQuery);

    const withFilter = await handler.execute(
      new GetAverageExecutionTimeQuery('11111111-1111-4111-8111-111111111111'),
    );
    const withoutFilter = await handler.execute(new GetAverageExecutionTimeQuery());

    expect(withFilter.approximated).toBe(true);
    expect(withoutFilter.approximated).toBe(false);
  });

  it('never computes an average itself, only relaying what the port answers', async () => {
    const aggregate: AverageExecutionTimeAggregate = { averageSeconds: 4321, workOrderCount: 7 };
    const metricsQuery = fakePort(aggregate);
    const handler = new GetAverageExecutionTimeHandler(metricsQuery);

    const result = await handler.execute(new GetAverageExecutionTimeQuery());

    expect(result.averageSeconds).toBe(4321);
    expect(result.workOrderCount).toBe(7);
    expect(metricsQuery.averageExecutionTime).toHaveBeenCalledTimes(1);
  });
});
