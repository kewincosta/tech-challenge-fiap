import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryServiceRepository } from '../../../../../../test/support/fakes/in-memory-service.repository';
import { RecordingDomainEventPublisher } from '../../../../../../test/support/fakes/recording-domain-event-publisher';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Service } from '../../../domain/entities/service';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceDeactivated } from '../../../domain/events/service-deactivated.event';
import { ServiceStatus } from '../../../domain/service-status';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceName } from '../../../domain/value-objects/service-name';
import { DeactivateServiceCommand } from './deactivate-service.command';
import { DeactivateServiceHandler } from './deactivate-service.handler';

const SERVICE_ID = ServiceId.create('11111111-1111-4111-8111-111111111111');

function makeHandler() {
  const services = new InMemoryServiceRepository();
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  const handler = new DeactivateServiceHandler(services, clock, events);
  return { handler, services, events, clock };
}

// A stored service has no pending events, like one the repository loaded.
function buildService(): Service {
  const service = Service.create({
    id: SERVICE_ID,
    name: ServiceName.create('Troca de oleo'),
    price: Money.fromCents(15099),
    duration: ServiceDuration.fromMinutes(60),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
  service.pullDomainEvents();
  return service;
}

describe('DeactivateServiceHandler', () => {
  it('should flip the status to INACTIVE and keep the record', async () => {
    const { handler, services, events, clock } = makeHandler();
    await services.save(buildService());

    await handler.execute(new DeactivateServiceCommand(SERVICE_ID.value));

    expect(services.services).toHaveLength(1);
    expect(services.services[0].status).toBe(ServiceStatus.Inactive);
    expect(events.published).toEqual([new ServiceDeactivated(SERVICE_ID.value, clock.now())]);
  });

  it('should be idempotent when deactivated twice', async () => {
    const { handler, services, events } = makeHandler();
    await services.save(buildService());
    await handler.execute(new DeactivateServiceCommand(SERVICE_ID.value));

    await expect(
      handler.execute(new DeactivateServiceCommand(SERVICE_ID.value)),
    ).resolves.not.toThrow();
    expect(services.services[0].status).toBe(ServiceStatus.Inactive);
    expect(events.published).toHaveLength(1);
  });

  it('should refuse an unknown service', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new DeactivateServiceCommand('00000000-0000-4000-8000-000000000001')),
    ).rejects.toThrow(ServiceNotFoundError);
  });
});
