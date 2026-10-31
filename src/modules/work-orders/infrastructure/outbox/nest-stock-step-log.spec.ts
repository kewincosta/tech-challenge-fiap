import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockStepKind } from '../../application/ports/pending-stock-steps.port';
import { NestStockStepLog } from './nest-stock-step-log';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const WORK_ORDER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NestStockStepLog', () => {
  it('logs at error level the kind of the step, its operation id, the work order and the last error, under StockStepOutbox', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    new NestStockStepLog().failed(
      {
        operationId: OPERATION_ID,
        kind: StockStepKind.WriteOff,
        workOrderId: WORK_ORDER_ID,
        actorUserId: ACTOR_ID,
      },
      'inventory is busy',
    );

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      `Stock step WRITE_OFF ${OPERATION_ID} for work order ${WORK_ORDER_ID} failed for good: inventory is busy`,
    );
    expect(error.mock.contexts[0]).toMatchObject({ context: 'StockStepOutbox' });
  });
});
