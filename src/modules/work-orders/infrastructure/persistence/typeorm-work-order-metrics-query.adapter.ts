import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ServiceKeyResolver } from '../../../services';
import {
  AverageExecutionTimeAggregate,
  AverageExecutionTimeFilter,
  WorkOrderMetricsQueryPort,
} from '../../application/ports/work-order-metrics-query.port';

interface AverageRow {
  average_seconds: string;
  work_order_count: string;
}

// EXISTS, never a JOIN on work_orders itself: a work order can carry the same catalog service on
// two separate line items (feature 5's own "two separate items when the same service is added
// twice"), and any join here - even a filtered one - could still fan out one work_orders row into
// several, corrupting AVG by counting that work order's elapsed time more than once. EXISTS is a
// pure filter, never a multiplier. Both timestamps are named NOT NULL explicitly rather than left
// implied by the status filter (design.md's fifth risk). COALESCE(..., 0) is what turns "no
// matching row" into the zero the spec asks for, in SQL rather than in a branch a use case would
// have to remember (AD-003: the read side never travels through an aggregate).
const AVERAGE_EXECUTION_TIME_SQL = `
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (wo.completed_at - wo.execution_started_at))), 0) AS average_seconds,
         COUNT(*) AS work_order_count
    FROM work_orders wo
   WHERE wo.status IN ('COMPLETED', 'DELIVERED')
     AND wo.execution_started_at IS NOT NULL
     AND wo.completed_at IS NOT NULL
     AND (
       $1::bigint IS NULL
       OR EXISTS (
         SELECT 1
           FROM work_order_services wos
          WHERE wos.work_order_id = wo.id
            AND wos.service_id = $1
       )
     )
     AND ($2::timestamptz IS NULL OR wo.completed_at >= $2)
     AND ($3::timestamptz IS NULL OR wo.completed_at <= $3)
`;

@Injectable()
export class TypeOrmWorkOrderMetricsQueryAdapter implements WorkOrderMetricsQueryPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly serviceKeys: ServiceKeyResolver,
  ) {}

  async averageExecutionTime(
    filter: AverageExecutionTimeFilter,
  ): Promise<AverageExecutionTimeAggregate> {
    // The service filter is the services module's key, so it is translated first (AD-013). A
    // service that does not exist is carried by no work order.
    let serviceInternalId: string | null = null;
    if (filter.serviceId !== undefined) {
      serviceInternalId = await this.serviceKeys.toInternalId(filter.serviceId);
      if (serviceInternalId === null) {
        return { averageSeconds: 0, workOrderCount: 0 };
      }
    }
    const rows: AverageRow[] = await this.dataSource.query(AVERAGE_EXECUTION_TIME_SQL, [
      serviceInternalId,
      filter.completedFrom ?? null,
      filter.completedTo ?? null,
    ]);
    return {
      averageSeconds: Math.round(Number(rows[0].average_seconds)),
      workOrderCount: Number(rows[0].work_order_count),
    };
  }
}
