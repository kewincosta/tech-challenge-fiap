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

  it('should rebuild an item from persisted props via restore', () => {
    const props: WorkOrderServiceItemProps = {
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Alinhamento',
      unitPrice: Money.fromCents(8000),
    };

    const item = WorkOrderServiceItem.restore(props);

    expect(item.id).toBe(ITEM_ID);
    expect(item.serviceName).toBe('Alinhamento');
    expect(item.unitPrice.cents).toBe(8000);
  });

  it('should expose read-only getters and no mutating method', () => {
    const item = WorkOrderServiceItem.add({
      id: ITEM_ID,
      serviceId: SERVICE_ID,
      serviceName: 'Troca de oleo',
      unitPrice: Money.fromCents(15099),
    });
    const prototype = Object.getPrototypeOf(item) as object;

    const members = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => Object.getOwnPropertyDescriptor(prototype, name));

    expect(members.length).toBeGreaterThan(0);
    // Every member is a getter (accessor with no setter) - nothing on the prototype can mutate
    // an already-built item.
    expect(members.every((member) => typeof member?.get === 'function' && !member.set)).toBe(true);
  });
});
