import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueServiceName } from '../support/factories/service.factory';
import { uniqueSku } from '../support/factories/sku.factory';
import { api, grantRole, login, registerUser, type AuthenticatedClient } from '../support/http';

let app: INestApplication;
let close: () => Promise<void>;
let admin: AuthenticatedClient;
let serviceAdvisor: AuthenticatedClient;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;

  const adminCredentials = await registerUser(app);
  await grantRole(app, adminCredentials.userId, 'ADMIN');
  admin = await login(app, adminCredentials);

  const advisorCredentials = await registerUser(app);
  await grantRole(app, advisorCredentials.userId, 'SERVICE_ADVISOR');
  serviceAdvisor = await login(app, advisorCredentials);
});

afterAll(async () => {
  await close();
});

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

async function registerCustomer(): Promise<{ customerId: string; userId: string }> {
  const target = await registerUser(app);
  const response = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: target.userId })
    .expect(201);
  return { customerId: (response.body as { id: string }).id, userId: target.userId };
}

async function registerVehicle(customerId: string): Promise<string> {
  const response = await api(app)
    .post('/api/v1/vehicles')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      customerId,
      plate: uniqueLicensePlate(),
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
    })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createCatalogService(): Promise<string> {
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents: 15099, estimatedDurationMinutes: 60 })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createInventoryItem(): Promise<string> {
  const response = await api(app)
    .post('/api/v1/inventory-items')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ sku: uniqueSku(), name: 'Filtro de oleo', kind: 'PART', unitPriceCents: 2500 })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createWorkOrder(): Promise<{ number: string; id: string }> {
  const { customerId } = await registerCustomer();
  const vehicleId = await registerVehicle(customerId);
  const response = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId, vehicleId })
    .expect(201);
  const body = response.body as { id: string; number: string };
  return { number: body.number, id: body.id };
}

describe('Work orders', () => {
  it('should create a work order as a service advisor', async () => {
    const { customerId } = await registerCustomer();
    const vehicleId = await registerVehicle(customerId);

    const response = await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String) as string,
      number: expect.stringMatching(/^[A-Z0-9]{6}-\d{4}$/) as string,
    });
  });

  it('should refuse a mechanic creating a work order with 403', async () => {
    const mechanic = await loginAs('MECHANIC');
    const { customerId } = await registerCustomer();
    const vehicleId = await registerVehicle(customerId);

    const response = await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse a second work order for the same vehicle with 409', async () => {
    const { customerId } = await registerCustomer();
    const vehicleId = await registerVehicle(customerId);
    await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(201);

    await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(409);
  });

  it('should refuse a deactivated customer with 422 and a vehicle that does not exist with 404', async () => {
    const { customerId } = await registerCustomer();
    const vehicleId = await registerVehicle(customerId);
    await api(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(422);

    const { customerId: otherCustomerId } = await registerCustomer();
    await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId: otherCustomerId, vehicleId: '00000000-0000-4000-8000-000000000001' })
      .expect(404);
  });

  it('should add a service and have it appear on the detail, refusing a mechanic with 403', async () => {
    const { number } = await createWorkOrder();
    const serviceId = await createCatalogService();
    const mechanic = await loginAs('MECHANIC');

    const forbidden = await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ serviceId })
      .expect(403);
    expect(forbidden.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const response = await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId })
      .expect(200);

    expect(response.body).toMatchObject({ serviceItems: [{ serviceId }] });
  });

  it('should refuse a part planned on a RECEIVED work order with 422, and refuse a mechanic planning a part with 403', async () => {
    const { number } = await createWorkOrder();
    const inventoryItemId = await createInventoryItem();
    const mechanic = await loginAs('MECHANIC');

    const forbidden = await api(app)
      .post(`/api/v1/work-orders/${number}/parts`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ inventoryItemId, quantity: 1 })
      .expect(403);
    expect(forbidden.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const response = await api(app)
      .post(`/api/v1/work-orders/${number}/parts`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ inventoryItemId, quantity: 1 })
      .expect(422);
    expect(response.body).toMatchObject({ code: 'WORK_ORDER_INVALID_STATE' });
  });

  it('should remove an item, refusing a mechanic with 403, and refuse an item of another work order with 404', async () => {
    const { number } = await createWorkOrder();
    const serviceId = await createCatalogService();
    const added = await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId })
      .expect(200);
    const itemId = (added.body as { serviceItems: Array<{ id: string }> }).serviceItems[0].id;
    const mechanic = await loginAs('MECHANIC');

    const forbidden = await api(app)
      .delete(`/api/v1/work-orders/${number}/items/${itemId}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);
    expect(forbidden.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const { number: otherNumber } = await createWorkOrder();
    await api(app)
      .delete(`/api/v1/work-orders/${otherNumber}/items/${itemId}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(404);

    await api(app)
      .delete(`/api/v1/work-orders/${number}/items/${itemId}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(204);
  });

  it('should assign a mechanic, refusing an actor without work-orders:manage with 403, and refuse a target user without the role with 422', async () => {
    const { number } = await createWorkOrder();
    const mechanicCredentials = await registerUser(app);
    await grantRole(app, mechanicCredentials.userId, 'MECHANIC');
    const mechanic = await loginAs('MECHANIC');

    const forbidden = await api(app)
      .put(`/api/v1/work-orders/${number}/mechanic`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ mechanicUserId: mechanicCredentials.userId })
      .expect(403);
    expect(forbidden.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const nonMechanic = await registerUser(app);
    const rejected = await api(app)
      .put(`/api/v1/work-orders/${number}/mechanic`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ mechanicUserId: nonMechanic.userId })
      .expect(422);
    expect(rejected.body).toMatchObject({ code: 'WORK_ORDER_ASSIGNED_USER_NOT_MECHANIC' });

    const response = await api(app)
      .put(`/api/v1/work-orders/${number}/mechanic`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ mechanicUserId: mechanicCredentials.userId })
      .expect(200);
    expect(response.body).toMatchObject({ assignedMechanicUserId: mechanicCredentials.userId });
  });

  it('should list the board and filter by status', async () => {
    const { id } = await createWorkOrder();

    const listed = await api(app)
      .get('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect((listed.body as Array<{ id: string }>).map((row) => row.id)).toContain(id);

    const filtered = await api(app)
      .get('/api/v1/work-orders')
      .query({ status: 'RECEIVED' })
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect((filtered.body as Array<{ id: string }>).map((row) => row.id)).toContain(id);
  });

  it('should return one work order by number, and 404 for an unknown number', async () => {
    const { number, id } = await createWorkOrder();

    const found = await api(app)
      .get(`/api/v1/work-orders/${number}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect(found.body).toMatchObject({ id, status: 'RECEIVED' });

    await api(app)
      .get('/api/v1/work-orders/ZZZZZZ-2026')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(404);
  });

  it('should answer 400 for a malformed number rather than 404', async () => {
    await api(app)
      .get('/api/v1/work-orders/not-a-number')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(400);
  });

  it('should return the trail to an administrator and 403 to a service advisor', async () => {
    const { number } = await createWorkOrder();

    const asAdmin = await api(app)
      .get(`/api/v1/work-orders/${number}/trail`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(asAdmin.body).toMatchObject([{ eventType: 'WORK_ORDER_CREATED' }]);

    const asAdvisor = await api(app)
      .get(`/api/v1/work-orders/${number}/trail`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(403);
    expect(asAdvisor.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should leave the work order snapshot unchanged after editing the customer or the vehicle', async () => {
    const { customerId } = await registerCustomer();
    const vehicleId = await registerVehicle(customerId);
    const created = await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId, vehicleId })
      .expect(201);
    const number = (created.body as { number: string }).number;

    await api(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ brand: 'Honda', model: 'Civic' })
      .expect(200);

    const found = await api(app)
      .get(`/api/v1/work-orders/${number}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect(found.body).toMatchObject({ vehicleBrand: 'Toyota', vehicleModel: 'Corolla' });
  });
});
