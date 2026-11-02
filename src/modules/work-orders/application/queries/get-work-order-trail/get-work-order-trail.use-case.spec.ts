import { describe, expect, it, vi } from 'vitest';
import { InvalidWorkOrderNumberError } from '../../../domain/errors/invalid-work-order-number.error';
import { WorkOrderNotFoundError } from '../../../domain/errors/work-order-not-found.error';
import {
  WorkOrderQueryPort,
  WorkOrderSummaryDto,
  WorkOrderTrailEntryDto,
} from '../../ports/work-order-query.port';
import { GetWorkOrderTrailUseCase } from './get-work-order-trail.use-case';
import { GetWorkOrderTrailQuery } from './get-work-order-trail.query';

const NUMBER = 'A1B090-2026';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const CREATED: WorkOrderTrailEntryDto = {
  id: '33333333-3333-4333-8333-333333333333',
  eventType: 'WORK_ORDER_CREATED',
  fromStatus: null,
  toStatus: 'RECEIVED',
  actorUserId: ACTOR_ID,
  occurredAt: new Date('2026-08-31T10:00:00.000Z'),
  note: null,
};

const DIAGNOSIS_STARTED: WorkOrderTrailEntryDto = {
  id: '44444444-4444-4444-8444-444444444444',
  eventType: 'DIAGNOSIS_STARTED',
  fromStatus: 'RECEIVED',
  toStatus: 'IN_DIAGNOSIS',
  actorUserId: ACTOR_ID,
  occurredAt: new Date('2026-08-31T11:00:00.000Z'),
  note: null,
};

// Like the real adapter, the port holds one work order and lists nothing for any other number.
function portHolding(trail: WorkOrderTrailEntryDto[]): WorkOrderQueryPort {
  const held = { id: '11111111-1111-4111-8111-111111111111', number: NUMBER };
  return {
    getByNumber: vi.fn((number: string) =>
      Promise.resolve(number === NUMBER ? (held as WorkOrderSummaryDto) : null),
    ),
    listBoard: vi.fn(),
    listByCustomerId: vi.fn(),
    listTrail: vi.fn((number: string) => Promise.resolve(number === NUMBER ? trail : [])),
  };
}

describe('GetWorkOrderTrailUseCase', () => {
  it('lists the trail of a work order in the order the port gives it', async () => {
    const useCase = new GetWorkOrderTrailUseCase(portHolding([CREATED, DIAGNOSIS_STARTED]));

    const result = await useCase.execute(new GetWorkOrderTrailQuery(NUMBER));

    expect(result).toEqual([CREATED, DIAGNOSIS_STARTED]);
  });

  it('refuses a well-formed number no work order carries with WorkOrderNotFoundError, not an empty trail', async () => {
    const useCase = new GetWorkOrderTrailUseCase(portHolding([CREATED]));

    await expect(useCase.execute(new GetWorkOrderTrailQuery('ZZZZZZ-2026'))).rejects.toThrow(
      WorkOrderNotFoundError,
    );
  });

  it('refuses a malformed number with InvalidWorkOrderNumberError, not the not-found error', async () => {
    const useCase = new GetWorkOrderTrailUseCase(portHolding([CREATED]));

    await expect(useCase.execute(new GetWorkOrderTrailQuery('not-a-number'))).rejects.toThrow(
      InvalidWorkOrderNumberError,
    );
  });
});
