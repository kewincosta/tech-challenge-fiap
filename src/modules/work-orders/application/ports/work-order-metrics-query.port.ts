export interface AverageExecutionTimeFilter {
  /** The catalog service's external id. */
  serviceId?: string;
  /** Inclusive. Filters on `completedAt`. */
  completedFrom?: Date;
  /** Inclusive. Filters on `completedAt`. */
  completedTo?: Date;
}

/**
 * The port's own answer: the aggregation alone, computed in SQL. It carries no notion of
 * "approximated" - that is a caller-level semantic (whether a service filter was given), added
 * by `GetAverageExecutionTimeHandler` (design.md's component split), never by this adapter.
 */
export interface AverageExecutionTimeAggregate {
  averageSeconds: number;
  workOrderCount: number;
}

/** What the query handler and the route answer - the aggregate plus the approximation flag. */
export interface AverageExecutionTimeDto extends AverageExecutionTimeAggregate {
  /**
   * True only when `serviceId` was given - a work order carrying several services contributes
   * its whole elapsed time to each, so the figure is not a decomposition of the total
   * (design.md's second risk).
   */
  approximated: boolean;
}

export interface WorkOrderMetricsQueryPort {
  averageExecutionTime(filter: AverageExecutionTimeFilter): Promise<AverageExecutionTimeAggregate>;
}

export const WORK_ORDER_METRICS_QUERY_PORT = Symbol('WorkOrderMetricsQueryPort');
