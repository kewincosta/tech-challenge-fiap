import {
  AverageExecutionTimeDto,
  WorkOrderMetricsQueryPort,
} from '../../ports/work-order-metrics-query.port';
import { GetAverageExecutionTimeQuery } from './get-average-execution-time.query';

/**
 * A thin pass to the port (`ListWorkOrdersUseCase`'s shape), with one addition the port itself
 * cannot know: whether a service filter was given. That is what marks the response approximated,
 * because a work order carrying several services contributes its whole elapsed time to each, so
 * the figure is not a decomposition of the total (design.md's second risk). The use case never
 * computes the average itself.
 */
export class GetAverageExecutionTimeUseCase {
  constructor(private readonly metricsQuery: WorkOrderMetricsQueryPort) {}

  async execute(query: GetAverageExecutionTimeQuery): Promise<AverageExecutionTimeDto> {
    const aggregate = await this.metricsQuery.averageExecutionTime({
      serviceId: query.serviceId,
      completedFrom: query.completedFrom,
      completedTo: query.completedTo,
    });
    return { ...aggregate, approximated: Boolean(query.serviceId) };
  }
}
