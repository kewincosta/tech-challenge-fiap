import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueServiceName } from '../support/factories/service.factory';
import { uniqueSku } from '../support/factories/sku.factory';
import {
  api,
  grantRole,
  login,
  registerUser,
  type AuthenticatedClient,
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
}

async function registerCustomer(): Promise<RegisteredCustomer> {
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

async function createCatalogService(priceCents = 15099): Promise<string> {
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents, estimatedDurationMinutes: 60 })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createInventoryItem(priceCents = 2500): Promise<string> {
  const response = await api(app)
    .post('/api/v1/inventory-items')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ sku: uniqueSku(), name: 'Filtro de oleo', kind: 'PART', unitPriceCents: priceCents })
    .expect(201);
  return (response.body as { id: string }).id;
}

interface CreatedWorkOrder {
  number: string;
  id: string;
  customerId: string;
  customerUserId: string;
}

async function createReceivedWorkOrder(): Promise<CreatedWorkOrder> {
  const { customerId, userId } = await registerCustomer();
  const vehicleId = await registerVehicle(customerId);
  const response = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId, vehicleId })
    .expect(201);
  const body = response.body as { id: string; number: string };
  return { number: body.number, id: body.id, customerId, customerUserId: userId };
}

async function addService(number: string, serviceId: string): Promise<void> {
  await api(app)
    .post(`/api/v1/work-orders/${number}/services`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ serviceId })
    .expect(200);
}

async function addPart(number: string, inventoryItemId: string, quantity: number): Promise<void> {
  await api(app)
    .post(`/api/v1/work-orders/${number}/parts`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ inventoryItemId, quantity })
    .expect(200);
}

/**
 * Builds a work order in AWAITING_APPROVAL with one service (150.99) and one part x2 (25.00).
 * Parts can only be planned during the diagnosis, never at reception (`PART_PLANNABLE_STATES`) -
 * the service is added first, in RECEIVED, then the diagnosis starts before the part.
 */
async function createAwaitingApprovalWorkOrder(): Promise<CreatedWorkOrder> {
  const workOrder = await createReceivedWorkOrder();
  const serviceId = await createCatalogService(15099);
  await addService(workOrder.number, serviceId);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  const inventoryItemId = await createInventoryItem(2500);
  await addPart(workOrder.number, inventoryItemId, 2);
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  return workOrder;
}

describe('Work order diagnosis and budget - main path', () => {
  it('walks RECEIVED to IN_DIAGNOSIS to AWAITING_APPROVAL to IN_EXECUTION through the API alone, with the round total computed from the items', async () => {
    const workOrder = await createReceivedWorkOrder();
    const serviceId = await createCatalogService(15099);
    await addService(workOrder.number, serviceId);

    const started = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    expect((started.body as { status: string }).status).toBe('IN_DIAGNOSIS');

    const inventoryItemId = await createInventoryItem(2500);
    await addPart(workOrder.number, inventoryItemId, 2);

    const completed = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    const completedBody = completed.body as {
      status: string;
      budgets: Array<{ round: number; totalCents: number; status: string }>;
    };
    expect(completedBody.status).toBe('AWAITING_APPROVAL');
    expect(completedBody.budgets).toHaveLength(1);
    expect(completedBody.budgets[0].round).toBe(1);
    expect(completedBody.budgets[0].totalCents).toBe(20099);
    expect(completedBody.budgets[0].status).toBe('PENDING');

    const approved = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect((approved.body as { status: string }).status).toBe('IN_EXECUTION');
  });

  it('answers 422 when the diagnosis is started twice', async () => {
    const workOrder = await createReceivedWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(422);
  });

  it('answers 422 when completing an empty diagnosis', async () => {
    const workOrder = await createReceivedWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(422);
  });

  it('refuses adding a service while AWAITING_APPROVAL with 422', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    const serviceId = await createCatalogService();

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId })
      .expect(422);
  });

  it('refuses removing an item while AWAITING_APPROVAL with 422', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    const detail = await api(app)
      .get(`/api/v1/work-orders/${workOrder.number}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const itemId = (detail.body as { serviceItems: Array<{ id: string }> }).serviceItems[0].id;

    await api(app)
      .delete(`/api/v1/work-orders/${workOrder.number}/items/${itemId}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(422);
  });

  it('refuses a service advisor (lacking work-orders:execute) starting a diagnosis with 403', async () => {
    const workOrder = await createReceivedWorkOrder();

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('refuses a service advisor (lacking work-orders:execute) completing a diagnosis with 403', async () => {
    const workOrder = await createReceivedWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('refuses a service advisor (lacking work-orders:execute) submitting a supplementary budget with 403', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/supplementary`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 404 for each of the five routes when the work order number does not exist', async () => {
    const unknown = 'ZZZZZZ-2026';
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/budget/supplementary`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/budget/rejection`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(404);
  });
});
