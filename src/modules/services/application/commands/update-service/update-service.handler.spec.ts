import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { InMemoryServiceRepository } from '../../../../../../test/support/fakes/in-memory-service.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { Service } from '../../../domain/entities/service';
import { ServiceNameAlreadyInUseError } from '../../../domain/errors/service-name-already-in-use.error';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceDuration } from '../../../domain/value-objects/service-duration';
import { ServiceId } from '../../../domain/value-objects/service-id';
import { ServiceName } from '../../../domain/value-objects/service-name';
import { UpdateServiceCommand } from './update-service.command';
import { UpdateServiceHandler } from './update-service.handler';

const SERVICE_ID = ServiceId.create('11111111-1111-4111-8111-111111111111');
const OTHER_ID = ServiceId.create('22222222-2222-4222-8222-222222222222');

function makeHandler() {
  const services = new InMemoryServiceRepository();
  const handler = new UpdateServiceHandler(services, new FakeClock(), stubEventBus().bus);
  return { handler, services };
}

function buildService(id: ServiceId, name: string): Service {
  return Service.create({
    id,
    name: ServiceName.create(name),
    description: 'Inclui filtro',
    price: Money.fromCents(15099),
    duration: ServiceDuration.fromMinutes(60),
    now: new Date('2026-08-31T12:00:00.000Z'),
  });
}

describe('UpdateServiceHandler', () => {
  it('should replace only the supplied fields', async () => {
    const { handler, services } = makeHandler();
    await services.save(buildService(SERVICE_ID, 'Troca de oleo'));

    await handler.execute(new UpdateServiceCommand(SERVICE_ID.value, undefined, undefined, 17500));

    const updated = services.services[0];
    expect(updated.price.cents).toBe(17500);
    expect(updated.name.value).toBe('Troca de oleo');
    expect(updated.description).toBe('Inclui filtro');
    expect(updated.duration.minutes).toBe(60);
  });

  it('should refuse a name another active service already holds', async () => {
    const { handler, services } = makeHandler();
    await services.save(buildService(SERVICE_ID, 'Troca de oleo'));
    await services.save(buildService(OTHER_ID, 'Alinhamento'));

    await expect(
      handler.execute(new UpdateServiceCommand(SERVICE_ID.value, 'ALINHAMENTO')),
    ).rejects.toThrow(ServiceNameAlreadyInUseError);
  });

  it('should accept renaming a service to the name it already holds', async () => {
    const { handler, services } = makeHandler();
    await services.save(buildService(SERVICE_ID, 'Troca de oleo'));

    await expect(
      handler.execute(new UpdateServiceCommand(SERVICE_ID.value, 'Troca de oleo')),
    ).resolves.not.toThrow();
  });

  it('should accept renaming onto a name only a deactivated service holds', async () => {
    // Same existsActiveByName call the create path uses, but exercised through update
    // (validation.md's Fix 3).
    const { handler, services } = makeHandler();
    await services.save(buildService(SERVICE_ID, 'Troca de oleo'));
    const retired = buildService(OTHER_ID, 'Alinhamento');
    retired.deactivate(new Date());
    await services.save(retired);

    await handler.execute(new UpdateServiceCommand(SERVICE_ID.value, 'Alinhamento'));

    expect(services.services.find((s) => s.id.equals(SERVICE_ID))?.name.value).toBe('Alinhamento');
  });

  it('should refuse an unknown service', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new UpdateServiceCommand('00000000-0000-4000-8000-000000000001', 'X')),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('should update a deactivated service, since status is orthogonal', async () => {
    const { handler, services } = makeHandler();
    const service = buildService(SERVICE_ID, 'Troca de oleo');
    service.deactivate(new Date());
    await services.save(service);

    await handler.execute(new UpdateServiceCommand(SERVICE_ID.value, undefined, undefined, 20000));

    expect(services.services[0].price.cents).toBe(20000);
  });

  it('should clear the description when explicitly given null', async () => {
    const { handler, services } = makeHandler();
    await services.save(buildService(SERVICE_ID, 'Troca de oleo'));

    await handler.execute(new UpdateServiceCommand(SERVICE_ID.value, undefined, null));

    expect(services.services[0].description).toBeNull();
  });
});
