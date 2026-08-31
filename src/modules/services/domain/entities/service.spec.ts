import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { ServiceStatus } from '../service-status';
import { ServiceCreated } from '../events/service-created.event';
import { ServiceDeactivated } from '../events/service-deactivated.event';
import { ServiceUpdated } from '../events/service-updated.event';
import { ServiceDuration } from '../value-objects/service-duration';
import { ServiceId } from '../value-objects/service-id';
import { ServiceName } from '../value-objects/service-name';
import { Service } from './service';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const SERVICE_ID = ServiceId.create('11111111-1111-4111-8111-111111111111');
const NAME = ServiceName.create('Troca de oleo');
const PRICE = Money.fromCents(15099);
const DURATION = ServiceDuration.fromMinutes(60);

function create(overrides: { description?: string | null } = {}) {
  return Service.create({
    id: SERVICE_ID,
    name: NAME,
    description: overrides.description,
    price: PRICE,
    duration: DURATION,
    now: NOW,
  });
}

describe('Service', () => {
  it('should create an active service and record ServiceCreated', () => {
    const service = create();

    expect(service.status).toBe(ServiceStatus.Active);
    expect(service.pullDomainEvents()).toEqual([new ServiceCreated(SERVICE_ID.value, NOW)]);
  });

  it('should accept a service created with no description', () => {
    expect(create().description).toBeNull();
  });

  it('should restore from persisted props with no domain event', () => {
    const service = Service.restore({
      id: SERVICE_ID,
      name: NAME,
      description: 'Inclui filtro',
      price: PRICE,
      duration: DURATION,
      status: ServiceStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(service.pullDomainEvents()).toEqual([]);
    expect(service.description).toBe('Inclui filtro');
  });

  it('should update only the supplied fields and record ServiceUpdated', () => {
    const service = create({ description: 'Inclui filtro' });
    service.pullDomainEvents();
    const newPrice = Money.fromCents(17500);

    service.updateDetails({ price: newPrice }, NOW);

    expect(service.price).toBe(newPrice);
    expect(service.name).toBe(NAME);
    expect(service.description).toBe('Inclui filtro');
    expect(service.duration).toBe(DURATION);
    expect(service.pullDomainEvents()).toEqual([new ServiceUpdated(SERVICE_ID.value, NOW)]);
  });

  it('should clear the description when explicitly given null', () => {
    const service = create({ description: 'Inclui filtro' });

    service.updateDetails({ description: null }, NOW);

    expect(service.description).toBeNull();
  });

  it('should leave the description untouched when the field is omitted', () => {
    const service = create({ description: 'Inclui filtro' });

    service.updateDetails({ price: Money.fromCents(1) }, NOW);

    expect(service.description).toBe('Inclui filtro');
  });

  it('should deactivate and record ServiceDeactivated', () => {
    const service = create();
    service.pullDomainEvents();

    service.deactivate(NOW);

    expect(service.status).toBe(ServiceStatus.Inactive);
    expect(service.pullDomainEvents()).toEqual([new ServiceDeactivated(SERVICE_ID.value, NOW)]);
  });

  it('should be idempotent when deactivated twice', () => {
    const service = create();
    service.deactivate(NOW);
    service.pullDomainEvents();

    service.deactivate(NOW);

    expect(service.pullDomainEvents()).toEqual([]);
  });
});
