import { describe, expect, it, vi } from 'vitest';
import { WorkOrderStatus } from '../../../domain/work-order-status';
import {
  WorkOrderBoardFilter,
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
} from '../../ports/work-order-query.port';
import { ListWorkOrdersQuery } from './list-work-orders.query';
import { ListWorkOrdersUseCase } from './list-work-orders.use-case';

function workOrder(id: string): WorkOrderSummaryDto {
  return { id, number: 'A1B090-2026' } as WorkOrderSummaryDto;
}

/** A port whose board answers `items` and `totalItems`, and records every filter it was asked. */
function fakePort(
  items: WorkOrderSummaryDto[],
  totalItems: number,
): { port: WorkOrderQueryPort; filters: WorkOrderBoardFilter[] } {
  const filters: WorkOrderBoardFilter[] = [];
  const port: WorkOrderQueryPort = {
    getByNumber: vi.fn(),
    listBoard: vi.fn((filter: WorkOrderBoardFilter) => {
      filters.push(filter);
      return Promise.resolve({ items, totalItems });
    }),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn(),
  };
  return { port, filters };
}

describe('ListWorkOrdersUseCase', () => {
  it('lists the work still open, in the order of the board, when no status is asked for', async () => {
    const { port, filters } = fakePort([], 0);

    await new ListWorkOrdersUseCase(port).execute(new ListWorkOrdersQuery(1, 20));

    expect(filters[0].statuses).toEqual([
      WorkOrderStatus.InExecution,
      WorkOrderStatus.AwaitingApproval,
      WorkOrderStatus.InDiagnosis,
      WorkOrderStatus.Received,
    ]);
  });

  it('lists exactly the statuses asked for, in the order of the board whatever order they came in', async () => {
    const { port, filters } = fakePort([], 0);
    const useCase = new ListWorkOrdersUseCase(port);

    await useCase.execute(
      new ListWorkOrdersQuery(1, 20, [WorkOrderStatus.Canceled, WorkOrderStatus.Delivered]),
    );
    await useCase.execute(
      new ListWorkOrdersQuery(1, 20, [
        WorkOrderStatus.Canceled,
        WorkOrderStatus.Delivered,
        WorkOrderStatus.Completed,
        WorkOrderStatus.Received,
        WorkOrderStatus.InDiagnosis,
        WorkOrderStatus.AwaitingApproval,
        WorkOrderStatus.InExecution,
      ]),
    );

    expect(filters[0].statuses).toEqual([WorkOrderStatus.Delivered, WorkOrderStatus.Canceled]);
    expect(filters[1].statuses).toEqual([
      WorkOrderStatus.InExecution,
      WorkOrderStatus.AwaitingApproval,
      WorkOrderStatus.InDiagnosis,
      WorkOrderStatus.Received,
      WorkOrderStatus.Completed,
      WorkOrderStatus.Delivered,
      WorkOrderStatus.Canceled,
    ]);
  });

  it('reads the page and the page size it was asked for', async () => {
    const { port, filters } = fakePort([], 0);

    await new ListWorkOrdersUseCase(port).execute(new ListWorkOrdersQuery(3, 50));

    expect(filters[0]).toMatchObject({ page: 3, pageSize: 50 });
  });

  it('answers the items and the totals the port holds, with the page and the page size asked for', async () => {
    const items = [workOrder('11111111-1111-4111-8111-111111111111')];
    const { port } = fakePort(items, 5);

    const page = await new ListWorkOrdersUseCase(port).execute(new ListWorkOrdersQuery(3, 2));

    expect(page).toEqual({ items, page: 3, pageSize: 2, totalItems: 5, totalPages: 3 });
  });

  it.each([
    { totalItems: 0, pageSize: 20, totalPages: 0 },
    { totalItems: 1, pageSize: 20, totalPages: 1 },
    { totalItems: 20, pageSize: 20, totalPages: 1 },
    { totalItems: 21, pageSize: 20, totalPages: 2 },
    { totalItems: 4, pageSize: 2, totalPages: 2 },
    { totalItems: 135, pageSize: 20, totalPages: 7 },
  ])(
    'counts $totalPages pages for $totalItems matches at $pageSize a page',
    async ({ totalItems, pageSize, totalPages }) => {
      const { port } = fakePort([], totalItems);

      const page = await new ListWorkOrdersUseCase(port).execute(
        new ListWorkOrdersQuery(1, pageSize),
      );

      expect(page.totalPages).toBe(totalPages);
    },
  );
});
