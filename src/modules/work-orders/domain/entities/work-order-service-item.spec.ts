import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderServiceItem, WorkOrderServiceItemProps } from './work-order-service-item';

const ITEM_ID = WorkOrderItemId.create('11111111-1111-4111-8111-111111111111');
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';

describe('WorkOrderServiceItem', () => {
  it('should build an item carrying the service identifier, its name and its unit price, with no quantity', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });

    expect(item.id).toBe(ITEM_ID);
    expect(item.serviceId).toBe(SERVICE_ID);
    expect(item.serviceName).toBe('Troca de oleo');
    expect(item.unitPrice.cents).toBe(15099);
    expect((item as unknown as Record<string, unknown>).quantity).toBeUndefined();
  });

  it('should be a draft, with no budget round and no budgeted price, when added', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });

    expect(item.isDraft).toBe(true);
    expect(item.budgetRound).toBeNull();
    expect(item.budgetedUnitPrice).toBeNull();
  });

  it('should rebuild an item from persisted props via restore', () => {
    const props: WorkOrderServiceItemProps = {
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      budgetRound: null,
      budgetedUnitPrice: null,
    };

    const item = WorkOrderServiceItem.restore(props);

    expect(item.id).toBe(ITEM_ID);
    expect(item.serviceName).toBe('Alinhamento');
    expect(item.unitPrice.cents).toBe(8000);
    expect(item.isDraft).toBe(true);
  });

  it('should restore an item already attached to a round', () => {
    const props: WorkOrderServiceItemProps = {
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
      budgetRound: 1,
      budgetedUnitPrice: Money.fromCents(8000),
    };

    const item = WorkOrderServiceItem.restore(props);

    expect(item.isDraft).toBe(false);
    expect(item.budgetRound).toBe(1);
    expect(item.budgetedUnitPrice?.cents).toBe(8000);
  });

  it('attachToBudget copies the current unit price as the budgeted price and stamps the round', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });

    item.attachToBudget(1);

    expect(item.isDraft).toBe(false);
    expect(item.budgetRound).toBe(1);
    expect(item.budgetedUnitPrice?.cents).toBe(15099);
    expect(item.unitPrice.cents).toBe(15099);
  });

  it('attachToBudget called again with the same round is idempotent', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });

    item.attachToBudget(1);
    item.attachToBudget(1);

    expect(item.budgetRound).toBe(1);
    expect(item.budgetedUnitPrice?.cents).toBe(15099);
  });

  it('should expose read-only getters and no mutating method beside attachToBudget', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });
    const prototype = Object.getPrototypeOf(item) as object;

    const members = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor' && name !== 'attachToBudget',
    );

    expect(members.length).toBeGreaterThan(0);
    // Every member but the one sanctioned mutator is a getter (accessor with no setter) -
    // nothing else on the prototype can mutate an already-built item (design.md's Risks &
    // Concerns).
    expect(
      members.every((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        return typeof descriptor?.get === 'function' && !descriptor.set;
      }),
    ).toBe(true);
  });
});
