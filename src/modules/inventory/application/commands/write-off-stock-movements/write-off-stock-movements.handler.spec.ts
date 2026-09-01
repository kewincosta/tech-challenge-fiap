import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InventoryItemRepository, MovementClosureInput } from '../../../domain/repositories/inventory-item.repository';
import { WriteOffStockMovementsCommand } from './write-off-stock-movements.command';
import { WriteOffStockMovementsHandler } from './write-off-stock-movements.handler';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function fakeItems(writeOffResult: number | Error = 0): InventoryItemRepository {
  return {
    findById: vi.fn(),
    existsActiveBySku: vi.fn(),
    save: vi.fn(),
    findAllByIdsForUpdate: vi.fn(),
    findPendingConsumptions: vi.fn(),
    settleWorkOrderConsumptions: vi.fn(),
    writeOffWorkOrderConsumptions: vi.fn(
      writeOffResult instanceof Error
        ? () => Promise.reject(writeOffResult)
        : () => Promise.resolve(writeOffResult),
    ),
  };
}

describe('WriteOffStockMovementsHandler', () => {
  it('calls writeOffWorkOrderConsumptions with the work order, the actor and the clock\'s moment', async () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const items = fakeItems(1);
    const handler = new WriteOffStockMovementsHandler(items, new FakeClock(now));

    await handler.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID));

    expect(items.writeOffWorkOrderConsumptions).toHaveBeenCalledTimes(1);
    const call = (items.writeOffWorkOrderConsumptions as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as MovementClosureInput;
    expect(call.workOrderId).toBe(WORK_ORDER_ID);
    expect(call.actorUserId).toBe(ACTOR_ID);
    expect(call.now).toEqual(now);
  });

  it('writes off nothing and does not throw for a work order with no outstanding consumption', async () => {
    const items = fakeItems(0);
    const handler = new WriteOffStockMovementsHandler(items, new FakeClock());

    await expect(
      handler.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)),
    ).resolves.not.toThrow();
  });

  it('lets an error from the repository travel out untouched', async () => {
    const items = fakeItems(new Error('boom'));
    const handler = new WriteOffStockMovementsHandler(items, new FakeClock());

    await expect(
      handler.execute(new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)),
    ).rejects.toThrow('boom');
  });
});
