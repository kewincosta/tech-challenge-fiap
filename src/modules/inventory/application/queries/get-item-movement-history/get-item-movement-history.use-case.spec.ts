import { describe, expect, it, vi } from 'vitest';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import {
  InventoryItemSummaryDto,
  InventoryQueryPort,
  StockMovementSummaryDto,
} from '../../ports/inventory-query.port';
import { GetItemMovementHistoryUseCase } from './get-item-movement-history.use-case';
import { GetItemMovementHistoryQuery } from './get-item-movement-history.query';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const WORK_ORDER_ID = '33333333-3333-4333-8333-333333333333';

const ITEM: InventoryItemSummaryDto = {
  id: ITEM_ID,
  sku: 'FLT-001',
  name: 'Filtro de oleo',
  description: null,
  kind: 'PART',
  unitPriceCents: 2500,
  quantityOnHand: 7,
  status: 'ACTIVE',
};

const INBOUND: StockMovementSummaryDto = {
  id: '44444444-4444-4444-8444-444444444444',
  kind: 'INBOUND',
  quantity: 10,
  unitPriceCents: 2500,
  actorUserId: ACTOR_ID,
  note: null,
  occurredAt: new Date('2026-08-30T10:00:00.000Z'),
  status: null,
  workOrderId: null,
  undoesMovementId: null,
};

const CONSUMPTION: StockMovementSummaryDto = {
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'CONSUMPTION',
  quantity: 3,
  unitPriceCents: 2500,
  actorUserId: ACTOR_ID,
  note: null,
  occurredAt: new Date('2026-08-31T10:00:00.000Z'),
  status: 'PENDING',
  workOrderId: WORK_ORDER_ID,
  undoesMovementId: null,
};

// Like the real adapter, the port holds one item and lists nothing for any other id.
function portHolding(
  held: InventoryItemSummaryDto | null,
  movements: StockMovementSummaryDto[],
): InventoryQueryPort {
  return {
    getById: vi.fn((id: string) => Promise.resolve(held?.id === id ? held : null)),
    listActive: vi.fn(),
    listMovements: vi.fn((id: string) => Promise.resolve(held?.id === id ? movements : [])),
    listStockShortages: vi.fn(),
    listOpenWorkOrderNumbersUsing: vi.fn(),
  };
}

describe('GetItemMovementHistoryUseCase', () => {
  it('lists the movements of an item that has them, in the order the port gives them', async () => {
    const useCase = new GetItemMovementHistoryUseCase(portHolding(ITEM, [INBOUND, CONSUMPTION]));

    const result = await useCase.execute(new GetItemMovementHistoryQuery(ITEM_ID));

    expect(result).toEqual([INBOUND, CONSUMPTION]);
  });

  it('answers an empty list for an item that exists and has no movement yet', async () => {
    const useCase = new GetItemMovementHistoryUseCase(portHolding(ITEM, []));

    const result = await useCase.execute(new GetItemMovementHistoryQuery(ITEM_ID));

    expect(result).toEqual([]);
  });

  it('refuses an item the port holds nothing for with the inventory item not-found error', async () => {
    const useCase = new GetItemMovementHistoryUseCase(portHolding(null, []));

    await expect(useCase.execute(new GetItemMovementHistoryQuery(ITEM_ID))).rejects.toThrow(
      InventoryItemNotFoundError,
    );
  });
});
