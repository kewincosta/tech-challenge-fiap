import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { Service } from '../../src/modules/services/domain/entities/service';
import { ServiceDuration } from '../../src/modules/services/domain/value-objects/service-duration';
import { ServiceId } from '../../src/modules/services/domain/value-objects/service-id';
import { ServiceName } from '../../src/modules/services/domain/value-objects/service-name';
import { ServiceOrmEntity } from '../../src/modules/services/infrastructure/persistence/service.orm-entity';
import { TypeOrmServiceQueryAdapter } from '../../src/modules/services/infrastructure/persistence/typeorm-service-query.adapter';
import { TypeOrmServiceRepository } from '../../src/modules/services/infrastructure/persistence/typeorm-service.repository';
import { uniqueServiceName } from '../support/factories/service.factory';
import { createTestDataSource } from '../support/db';

let dataSource: DataSource;
let queryAdapter: TypeOrmServiceQueryAdapter;
let repository: TypeOrmServiceRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  queryAdapter = new TypeOrmServiceQueryAdapter(dataSource);
  repository = new TypeOrmServiceRepository(dataSource.getRepository(ServiceOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function saveService(priceCents = 15099): Promise<Service> {
  const service = Service.create({
    id: ServiceId.create(randomUUID()),
    name: ServiceName.create(uniqueServiceName()),
    description: 'Inclui filtro',
    price: Money.fromCents(priceCents),
    duration: ServiceDuration.fromMinutes(60),
    now: new Date(),
  });
  await repository.save(service);
  return service;
}

describe('TypeOrmServiceQueryAdapter', () => {
  it('should get a service by external id with every field', async () => {
    const service = await saveService();

    const found = await queryAdapter.getById(service.id.value);

    expect(found).toMatchObject({
      id: service.id.value,
      name: service.name.value,
      description: 'Inclui filtro',
      priceCents: 15099,
      estimatedDurationMinutes: 60,
      status: 'ACTIVE',
    });
  });

  it('should return the price as a number, not the driver string', async () => {
    const service = await saveService(20000);

    const found = await queryAdapter.getById(service.id.value);

    expect(typeof found?.priceCents).toBe('number');
    expect(found?.priceCents).toBe(20000);
  });

  it('should return null for an unknown external id', async () => {
    expect(await queryAdapter.getById(randomUUID())).toBeNull();
  });

  it('should still return a deactivated service by id, with INACTIVE status', async () => {
    // The distinction feature 5 needs to refuse rule 18 precisely instead of answering 404.
    const service = await saveService();
    service.deactivate(new Date());
    await repository.save(service);

    const found = await queryAdapter.getById(service.id.value);

    expect(found?.status).toBe('INACTIVE');
  });

  it('should exclude a deactivated service from the active list', async () => {
    const active = await saveService();
    const deactivated = await saveService();
    deactivated.deactivate(new Date());
    await repository.save(deactivated);

    const listed = await queryAdapter.listActive();
    const ids = listed.map((service) => service.id);

    expect(ids).toContain(active.id.value);
    expect(ids).not.toContain(deactivated.id.value);
  });
});
