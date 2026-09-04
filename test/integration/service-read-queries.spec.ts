import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Money } from '../../src/shared/domain/value-objects/money';
import { GetServiceHandler } from '../../src/modules/services/application/queries/get-service/get-service.handler';
import { GetServiceQuery } from '../../src/modules/services/application/queries/get-service/get-service.query';
import { ListServicesHandler } from '../../src/modules/services/application/queries/list-services/list-services.handler';
import { ListServicesQuery } from '../../src/modules/services/application/queries/list-services/list-services.query';
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
let getServiceHandler: GetServiceHandler;
let listServicesHandler: ListServicesHandler;
let repository: TypeOrmServiceRepository;

beforeAll(async () => {
  dataSource = createTestDataSource();
  await dataSource.initialize();
  const queryAdapter = new TypeOrmServiceQueryAdapter(dataSource);
  getServiceHandler = new GetServiceHandler(queryAdapter);
  listServicesHandler = new ListServicesHandler(queryAdapter);
  repository = new TypeOrmServiceRepository(dataSource.getRepository(ServiceOrmEntity));
});

afterAll(async () => {
  await dataSource.destroy();
});

async function saveService(): Promise<Service> {
  const service = Service.create({
    id: ServiceId.create(randomUUID()),
    name: ServiceName.create(uniqueServiceName()),
    price: Money.fromCents(15099),
    duration: ServiceDuration.fromMinutes(60),
    now: new Date(),
  });
  await repository.save(service);
  return service;
}

describe('Service read queries', () => {
  it('should get a service by its external id', async () => {
    const service = await saveService();

    const found = await getServiceHandler.execute(new GetServiceQuery(service.id.value));

    expect(found?.id).toBe(service.id.value);
    expect(found?.priceCents).toBe(15099);
  });

  it('should return a deactivated service with its status, not null', async () => {
    const service = await saveService();
    service.deactivate(new Date());
    await repository.save(service);

    const found = await getServiceHandler.execute(new GetServiceQuery(service.id.value));

    expect(found?.status).toBe('INACTIVE');
  });

  it('should return null for an id that does not exist', async () => {
    expect(await getServiceHandler.execute(new GetServiceQuery(randomUUID()))).toBeNull();
  });

  it('should return null for a malformed id, not throw', async () => {
    expect(await getServiceHandler.execute(new GetServiceQuery('not-a-uuid'))).toBeNull();
  });

  it('should list active services only', async () => {
    const active = await saveService();
    const deactivated = await saveService();
    deactivated.deactivate(new Date());
    await repository.save(deactivated);

    const ids = (await listServicesHandler.execute(new ListServicesQuery())).map(
      (service) => service.id,
    );

    expect(ids).toContain(active.id.value);
    expect(ids).not.toContain(deactivated.id.value);
  });
});
