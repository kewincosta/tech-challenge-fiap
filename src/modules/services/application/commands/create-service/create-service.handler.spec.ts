import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryServiceRepository } from '../../../../../../test/support/fakes/in-memory-service.repository';
import { InvalidMoneyAmountError } from '../../../../../shared/domain/errors/invalid-money-amount.error';
import { ServiceStatus } from '../../../domain/service-status';
import { InvalidServiceDurationError } from '../../../domain/errors/invalid-service-duration.error';
import { ServiceNameAlreadyInUseError } from '../../../domain/errors/service-name-already-in-use.error';
import { CreateServiceCommand } from './create-service.command';
import { CreateServiceHandler } from './create-service.handler';

function makeHandler() {
  const services = new InMemoryServiceRepository();
  const handler = new CreateServiceHandler(
    services,
    new FakeIdGenerator(),
    new FakeClock(),
    stubEventBus().bus,
  );
  return { handler, services };
}

describe('CreateServiceHandler', () => {
  it('should create an active service and return its id', async () => {
    const { handler, services } = makeHandler();

    const result = await handler.execute(
      new CreateServiceCommand('Troca de oleo', 15099, 60, 'Inclui filtro'),
    );

    const created = services.services[0];
    expect(result.id).toBe(created.id.value);
    expect(created.status).toBe(ServiceStatus.Active);
    expect(created.price.cents).toBe(15099);
    expect(created.duration.minutes).toBe(60);
  });

  it('should refuse a negative price through the shared kernel Money', async () => {
    const { handler, services } = makeHandler();

    await expect(
      handler.execute(new CreateServiceCommand('Troca de oleo', -1, 60)),
    ).rejects.toThrow(InvalidMoneyAmountError);
    expect(services.services).toHaveLength(0);
  });

  it('should refuse a zero duration', async () => {
    const { handler, services } = makeHandler();

    await expect(
      handler.execute(new CreateServiceCommand('Troca de oleo', 15099, 0)),
    ).rejects.toThrow(InvalidServiceDurationError);
    expect(services.services).toHaveLength(0);
  });

  it('should refuse a name an active service already holds, case-insensitively', async () => {
    const { handler, services } = makeHandler();
    await handler.execute(new CreateServiceCommand('Troca de oleo', 15099, 60));

    await expect(
      handler.execute(new CreateServiceCommand('TROCA DE OLEO', 20000, 90)),
    ).rejects.toThrow(ServiceNameAlreadyInUseError);
    expect(services.services).toHaveLength(1);
  });

  it('should accept a creation with no description', async () => {
    const { handler, services } = makeHandler();

    await handler.execute(new CreateServiceCommand('Alinhamento', 8000, 30));

    expect(services.services[0].description).toBeNull();
  });

  it('should accept a price of zero', async () => {
    const { handler, services } = makeHandler();

    await handler.execute(new CreateServiceCommand('Revisao de cortesia', 0, 30));

    expect(services.services[0].price.cents).toBe(0);
  });
});
