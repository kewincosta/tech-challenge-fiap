import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueServiceName } from '../support/factories/service.factory';
import {
  api,
  grantRole,
  login,
  registerAndLogin,
  registerUser,
  type AuthenticatedClient,
} from '../support/http';

let app: INestApplication;
let close: () => Promise<void>;
let admin: AuthenticatedClient;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;

  const adminCredentials = await registerUser(app);
  await grantRole(app, adminCredentials.userId, 'ADMIN');
  admin = await login(app, adminCredentials);
});

afterAll(async () => {
  await close();
});

async function createService(overrides: { name?: string; priceCents?: number } = {}) {
  const name = overrides.name ?? uniqueServiceName();
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      name,
      description: 'Inclui filtro',
      priceCents: overrides.priceCents ?? 15099,
      estimatedDurationMinutes: 60,
    })
    .expect(201);
  return { id: (response.body as { id: string }).id, name };
}

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

describe('Services', () => {
  it('should create a service as an administrator', async () => {
    const response = await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: uniqueServiceName(),
        priceCents: 15099,
        estimatedDurationMinutes: 60,
      })
      .expect(201);

    expect(response.body).toEqual({ id: expect.any(String) as string });
  });

  it('should refuse a service advisor trying to create a service', async () => {
    const advisor = await loginAs('SERVICE_ADVISOR');

    const response = await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${advisor.accessToken}`)
      .send({ name: uniqueServiceName(), priceCents: 15099, estimatedDurationMinutes: 60 })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should let a mechanic list and read the catalog', async () => {
    const mechanic = await loginAs('MECHANIC');
    const service = await createService();

    const listed = await api(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    expect((listed.body as Array<{ id: string }>).map((s) => s.id)).toContain(service.id);

    const read = await api(app)
      .get(`/api/v1/services/${service.id}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    expect(read.body).toMatchObject({ id: service.id, priceCents: 15099, status: 'ACTIVE' });
  });

  it('should refuse a customer holding neither services permission', async () => {
    const customer = await registerAndLogin(app);

    await api(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);
    await api(app)
      .get('/api/v1/services/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);
  });

  it('should refuse a negative price with 400 and a zero duration with 400', async () => {
    await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: uniqueServiceName(), priceCents: -1, estimatedDurationMinutes: 60 })
      .expect(400);

    await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: uniqueServiceName(), priceCents: 15099, estimatedDurationMinutes: 0 })
      .expect(400);
  });

  it('should refuse a duplicate active name with 409, case-insensitively', async () => {
    const service = await createService();

    const response = await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: service.name.toUpperCase(),
        priceCents: 20000,
        estimatedDurationMinutes: 90,
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'SERVICE_NAME_ALREADY_IN_USE' });
  });

  it('should update a service price and description', async () => {
    const service = await createService();

    const response = await api(app)
      .patch(`/api/v1/services/${service.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ priceCents: 17500, description: 'Inclui filtro e mao de obra' })
      .expect(200);

    expect(response.body).toMatchObject({
      priceCents: 17500,
      description: 'Inclui filtro e mao de obra',
      name: service.name,
    });
  });

  it('should deactivate a service, drop it from the list, and still return it by id', async () => {
    const service = await createService();

    await api(app)
      .delete(`/api/v1/services/${service.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const listed = await api(app)
      .get('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((listed.body as Array<{ id: string }>).map((s) => s.id)).not.toContain(service.id);

    // Still readable by id, with its status - the contract feature 5 needs for rule 18.
    const read = await api(app)
      .get(`/api/v1/services/${service.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(read.body).toMatchObject({ id: service.id, status: 'INACTIVE' });
  });

  it('should free the name of a deactivated service for reuse', async () => {
    const service = await createService();
    await api(app)
      .delete(`/api/v1/services/${service.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: service.name, priceCents: 15099, estimatedDurationMinutes: 60 })
      .expect(201);
  });

  it('should return 404 for a service id that does not exist', async () => {
    await api(app)
      .get('/api/v1/services/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });
});
