import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueServiceName } from '../support/factories/service.factory';
import {
  api,
  grantRole,
  login,
  registerUser,
  revokeRole,
  type AuthenticatedClient,
  type RegisteredCredentials,
} from '../support/http';

let app: INestApplication;
let close: () => Promise<void>;
let admin: AuthenticatedClient;
let serviceAdvisor: AuthenticatedClient;
let mechanic: AuthenticatedClient;

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

  const mechanicCredentials = await registerUser(app);
  await grantRole(app, mechanicCredentials.userId, 'MECHANIC');
  mechanic = await login(app, mechanicCredentials);
});

afterAll(async () => {
  await close();
});

interface RegisteredCustomer {
  customerId: string;
  userId: string;
  credentials: RegisteredCredentials;
}

async function registerCustomer(): Promise<RegisteredCustomer> {
  const target = await registerUser(app);
  const response = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: target.userId })
    .expect(201);
  return {
    customerId: (response.body as { id: string }).id,
    userId: target.userId,
    credentials: target,
  };
}

/** Registering a customer does not itself grant CUSTOMER - the role controls API access. */
async function loginAsCustomer(customer: RegisteredCustomer): Promise<AuthenticatedClient> {
  await grantRole(app, customer.userId, 'CUSTOMER');
  return login(app, customer.credentials);
}

/** Registration always assigns CUSTOMER (RegisterUserHandler), which itself carries
 * work-orders:read-own - so proving a 403 without that permission means stripping the one role
 * every account gets by default, leaving an authenticated actor with no permissions at all. */
async function loginWithNoRoles(): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await revokeRole(app, credentials.userId, 'CUSTOMER');
  return login(app, credentials);
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

async function createCatalogService(priceCents = 15099): Promise<string> {
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents, estimatedDurationMinutes: 60 })
    .expect(201);
  return (response.body as { id: string }).id;
}

interface CreatedWorkOrder {
  number: string;
  id: string;
}

async function createReceivedWorkOrder(customer: RegisteredCustomer): Promise<CreatedWorkOrder> {
  const vehicleId = await registerVehicle(customer.customerId);
  const response = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId: customer.customerId, vehicleId })
    .expect(201);
  const body = response.body as { id: string; number: string };
  return { number: body.number, id: body.id };
}

/** Walks a work order from RECEIVED to COMPLETED through the API - a service is enough, no part
 * or withdrawal needed for the metric, which only reads execution_started_at and completed_at. */
async function createCompletedWorkOrder(customer: RegisteredCustomer): Promise<CreatedWorkOrder> {
  const workOrder = await createReceivedWorkOrder(customer);
  const serviceId = await createCatalogService();
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/services`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ serviceId })
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  return workOrder;
}

describe('Work order tracking - the customer routes', () => {
  it('answers 200 with a list on /work-orders/me for a customer who owns a work order, proving the route is not shadowed by :number', async () => {
    const customer = await registerCustomer();
    const client = await loginAsCustomer(customer);
    const workOrder = await createReceivedWorkOrder(customer);

    const response = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const numbers = (response.body as Array<{ number: string }>).map((row) => row.number);

    expect(numbers).toContain(workOrder.number);
  });

  it("sees only their own work orders, never a second customer's", async () => {
    const first = await registerCustomer();
    const second = await registerCustomer();
    const firstClient = await loginAsCustomer(first);
    const firstWorkOrder = await createReceivedWorkOrder(first);
    const secondWorkOrder = await createReceivedWorkOrder(second);

    const response = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${firstClient.accessToken}`)
      .expect(200);
    const numbers = (response.body as Array<{ number: string }>).map((row) => row.number);

    expect(numbers).toContain(firstWorkOrder.number);
    expect(numbers).not.toContain(secondWorkOrder.number);
  });

  it('answers 200 with an empty list for a user with no customer record', async () => {
    const credentials = await registerUser(app);
    await grantRole(app, credentials.userId, 'CUSTOMER');
    const client = await login(app, credentials);

    const response = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('reads one of their own work orders in full, items and budgets included', async () => {
    const customer = await registerCustomer();
    const client = await loginAsCustomer(customer);
    const workOrder = await createReceivedWorkOrder(customer);
    const serviceId = await createCatalogService();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId })
      .expect(200);

    const response = await api(app)
      .get(`/api/v1/work-orders/me/${workOrder.number}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const body = response.body as { number: string; serviceItems: unknown[]; budgets: unknown[] };

    expect(body.number).toBe(workOrder.number);
    expect(body.serviceItems).toHaveLength(1);
    expect(body.budgets).toEqual([]);
  });

  it("answers 404 for a second customer's work order number, identical to a number nobody carries", async () => {
    const owner = await registerCustomer();
    const stranger = await registerCustomer();
    const strangerClient = await loginAsCustomer(stranger);
    const workOrder = await createReceivedWorkOrder(owner);

    const forStranger = await api(app)
      .get(`/api/v1/work-orders/me/${workOrder.number}`)
      .set('Authorization', `Bearer ${strangerClient.accessToken}`)
      .expect(404);
    const forUnknown = await api(app)
      .get(`/api/v1/work-orders/me/ZZZZZZ-2026`)
      .set('Authorization', `Bearer ${strangerClient.accessToken}`)
      .expect(404);

    // Same shape and code, not the full body: `reference` is a fresh UUID per request.
    const { reference: strangerReference, ...strangerBody } = forStranger.body as { reference: string };
    const { reference: unknownReference, ...unknownBody } = forUnknown.body as { reference: string };
    expect(strangerBody).toEqual(unknownBody);
    expect(strangerReference).not.toBe(unknownReference);
  });

  it('answers 403 on /work-orders/me for an actor lacking work-orders:read-own', async () => {
    const noRoles = await loginWithNoRoles();

    const response = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${noRoles.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 403 on /work-orders/me/:number for an actor lacking work-orders:read-own', async () => {
    const noRoles = await loginWithNoRoles();

    const response = await api(app)
      .get('/api/v1/work-orders/me/ZZZZZZ-2026')
      .set('Authorization', `Bearer ${noRoles.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 401 on /work-orders/me without a token', async () => {
    await api(app).get('/api/v1/work-orders/me').expect(401);
  });

  it('answers 401 on /work-orders/me/:number without a token', async () => {
    await api(app).get('/api/v1/work-orders/me/ZZZZZZ-2026').expect(401);
  });

  it('answers 400 for a malformed number on /work-orders/me/:number', async () => {
    const customer = await registerCustomer();
    const client = await loginAsCustomer(customer);

    await api(app)
      .get('/api/v1/work-orders/me/not-a-number')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(400);
  });
});

describe('Work order tracking - the average execution time metric', () => {
  it('reads an average, in whole seconds with a count, over work orders driven to completion through the API alone', async () => {
    const customer = await registerCustomer();
    await createCompletedWorkOrder(customer);

    const response = await api(app)
      .get('/api/v1/work-orders/metrics/average-execution-time')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const body = response.body as {
      averageSeconds: number;
      workOrderCount: number;
      approximated: boolean;
    };

    expect(Number.isInteger(body.averageSeconds)).toBe(true);
    expect(body.workOrderCount).toBeGreaterThanOrEqual(1);
    expect(body.approximated).toBe(false);
  });

  it('marks the response approximated when a service filter is given', async () => {
    const customer = await registerCustomer();
    await createCompletedWorkOrder(customer);
    const someService = await createCatalogService();

    const response = await api(app)
      .get('/api/v1/work-orders/metrics/average-execution-time')
      .query({ serviceId: someService })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect((response.body as { approximated: boolean }).approximated).toBe(true);
  });

  it('does not mark the response approximated without a service filter', async () => {
    const response = await api(app)
      .get('/api/v1/work-orders/metrics/average-execution-time')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect((response.body as { approximated: boolean }).approximated).toBe(false);
  });

  it('answers 403 for an actor lacking metrics:read', async () => {
    const response = await api(app)
      .get('/api/v1/work-orders/metrics/average-execution-time')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 401 without a token', async () => {
    await api(app).get('/api/v1/work-orders/metrics/average-execution-time').expect(401);
  });
});
