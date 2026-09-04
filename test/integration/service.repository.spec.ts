import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { Service } from '../../src/modules/services/domain/entities/service';
import { ServiceNameAlreadyInUseError } from '../../src/modules/services/domain/errors/service-name-already-in-use.error';
import { ServiceDuration } from '../../src/modules/services/domain/value-objects/service-duration';
import { ServiceId } from '../../src/modules/services/domain/value-objects/service-id';
import { ServiceName } from '../../src/modules/services/domain/value-objects/service-name';
import { ServiceOrmEntity } from '../../src/modules/services/infrastructure/persistence/service.orm-entity';
import { TypeOrmServiceRepository } from '../../src/modules/services/infrastructure/persistence/typeorm-service.repository';
import { uniqueServiceName } from '../support/factories/service.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let repository: TypeOrmServiceRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  repository = new TypeOrmServiceRepository(dataSource.getRepository(ServiceOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

function buildService(overrides: { name?: string; priceCents?: number } = {}): Service {
  return Service.create({
    id: ServiceId.create(randomUUID()),
    name: ServiceName.create(overrides.name ?? uniqueServiceName()),
    description: 'Inclui filtro',
    price: Money.fromCents(overrides.priceCents ?? 15099),
    duration: ServiceDuration.fromMinutes(60),
    now: new Date(),
  });
}

describe('TypeOrmServiceRepository', () => {
  it('should round-trip a save-then-find', async () => {
    const service = buildService();

    await repository.save(service);
    const found = await repository.findById(service.id);

    expect(found?.name.value).toBe(service.name.value);
    expect(found?.description).toBe('Inclui filtro');
    expect(found?.duration.minutes).toBe(60);
  });

  it('should reload a price as an exact number even though the driver returns bigint as a string', async () => {
    const service = buildService({ priceCents: 15099 });
    await repository.save(service);

    const raw: Array<{ price_cents: string }> = await dataSource.query(
      `SELECT price_cents FROM services WHERE external_id = $1`,
      [service.id.value],
    );
    const found = await repository.findById(service.id);

    // The hazard the service catalog phase named: without the mapper's explicit conversion
    // this column reads back as the string "15099", not the number 15099.
    expect(typeof raw[0].price_cents).toBe('string');
    expect(found?.price.cents).toBe(15099);
    expect(typeof found?.price.cents).toBe('number');
  });

  it('should round-trip a price of zero', async () => {
    const service = buildService({ priceCents: 0 });

    await repository.save(service);

    expect((await repository.findById(service.id))?.price.cents).toBe(0);
  });

  it('should match existsActiveByName case-insensitively', async () => {
    const name = uniqueServiceName('Troca de Oleo');
    await repository.save(buildService({ name }));

    expect(await repository.existsActiveByName(ServiceName.create(name.toLowerCase()))).toBe(true);
    expect(await repository.existsActiveByName(ServiceName.create(name.toUpperCase()))).toBe(true);
    expect(await repository.existsActiveByName(ServiceName.create(uniqueServiceName()))).toBe(false);
  });

  it('should stop matching a name once its service is deactivated, freeing it for reuse', async () => {
    const name = uniqueServiceName();
    const service = buildService({ name });
    await repository.save(service);
    service.deactivate(new Date());
    await repository.save(service);

    expect(await repository.existsActiveByName(ServiceName.create(name))).toBe(false);
    await expect(repository.save(buildService({ name }))).resolves.not.toThrow();
  });

  it('should map the real unique-index violation to ServiceNameAlreadyInUseError', async () => {
    const name = uniqueServiceName();
    await repository.save(buildService({ name }));

    // Bypasses the application-layer pre-check on purpose: this is the concurrent case, where two
    // writers both pass the check and the database is the only thing left to stop the second.
    await expect(repository.save(buildService({ name: name.toUpperCase() }))).rejects.toThrow(
      ServiceNameAlreadyInUseError,
    );
  });
});
