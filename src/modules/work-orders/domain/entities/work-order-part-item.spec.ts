import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { InvalidPlannedQuantityError } from '../errors/invalid-planned-quantity.error';
import { ReturnExceedsWithdrawnError } from '../errors/return-exceeds-withdrawn.error';
import { WithdrawalExceedsPlannedError } from '../errors/withdrawal-exceeds-planned.error';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderPartItem, WorkOrderPartItemProps } from './work-order-part-item';

const ITEM_ID = WorkOrderItemId.create('11111111-1111-4111-8111-111111111111');
const INVENTORY_ITEM_ID = '22222222-2222-4222-8222-222222222222';

describe('WorkOrderPartItem', () => {
  it('should build an item carrying the inventory item identifier, its SKU, its name, its unit price and the planned quantity', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    expect(item.id).toBe(ITEM_ID);
    expect(item.inventoryItemId).toBe(INVENTORY_ITEM_ID);
    expect(item.sku).toBe('FLT-001');
    expect(item.itemName).toBe('Filtro de oleo');
    expect(item.unitPrice.cents).toBe(2500);
    expect(item.plannedQuantity.units).toBe(3);
  });

  it('should give a newly added item a withdrawn quantity of zero', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    expect(item.withdrawnQuantity).toBe(0);
  });

  it('should be a draft, with no budget round and no budgeted price, when added', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    expect(item.isDraft).toBe(true);
    expect(item.budgetRound).toBeNull();
    expect(item.budgetedUnitPrice).toBeNull();
  });

  it('should rebuild an item from persisted props via restore, withdrawn quantity included', () => {
    const props: WorkOrderPartItemProps = {
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
      withdrawnQuantity: 2,
      budgetRound: null,
      budgetedUnitPrice: null,
    };

    const item = WorkOrderPartItem.restore(props);

    expect(item.withdrawnQuantity).toBe(2);
    expect(item.plannedQuantity.units).toBe(3);
    expect(item.isDraft).toBe(true);
  });

  it('should restore an item already attached to a round', () => {
    const props: WorkOrderPartItemProps = {
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
      withdrawnQuantity: 0,
      budgetRound: 2,
      budgetedUnitPrice: Money.fromCents(2500),
    };

    const item = WorkOrderPartItem.restore(props);

    expect(item.isDraft).toBe(false);
    expect(item.budgetRound).toBe(2);
    expect(item.budgetedUnitPrice?.cents).toBe(2500);
  });

  it('attachToBudget copies the current unit price as the budgeted price and stamps the round', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    item.attachToBudget(1);

    expect(item.isDraft).toBe(false);
    expect(item.budgetRound).toBe(1);
    expect(item.budgetedUnitPrice?.cents).toBe(2500);
    expect(item.unitPrice.cents).toBe(2500);
  });

  it('attachToBudget called again with the same round is idempotent', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    item.attachToBudget(1);
    item.attachToBudget(1);

    expect(item.budgetRound).toBe(1);
    expect(item.budgetedUnitPrice?.cents).toBe(2500);
  });

  it('should refuse a zero planned quantity through PlannedQuantity', () => {
    expect(() => PlannedQuantity.create(0)).toThrow(InvalidPlannedQuantityError);
  });

  it('should raise the withdrawn quantity on withdraw, accumulating across calls', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });

    item.withdraw(1);
    item.withdraw(1);

    expect(item.withdrawnQuantity).toBe(2);
    expect(item.outstandingQuantity).toBe(1);
  });

  it('should refuse a withdrawal that would pass the planned quantity, leaving it unchanged', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(2),
    });
    item.withdraw(2);

    expect(() => item.withdraw(1)).toThrow(WithdrawalExceedsPlannedError);
    expect(item.withdrawnQuantity).toBe(2);
  });

  it('should lower the withdrawn quantity on returnUnits', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });
    item.withdraw(2);

    item.returnUnits(1);

    expect(item.withdrawnQuantity).toBe(1);
  });

  it('should refuse a return that would take the withdrawn quantity below zero, leaving it unchanged', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });
    item.withdraw(1);

    expect(() => item.returnUnits(2)).toThrow(ReturnExceedsWithdrawnError);
    expect(item.withdrawnQuantity).toBe(1);
  });

  it('should end a withdraw-then-return-in-full round trip at a withdrawn quantity of zero', () => {
    const item = WorkOrderPartItem.add({
      id: ITEM_ID,
      inventoryItemId: INVENTORY_ITEM_ID,
      sku: 'FLT-001',
      itemName: 'Filtro de oleo',
      unitPrice: Money.fromCents(2500),
      plannedQuantity: PlannedQuantity.create(3),
    });
    item.withdraw(2);

    item.returnUnits(2);

    expect(item.withdrawnQuantity).toBe(0);
    expect(item.outstandingQuantity).toBe(3);
  });
});
