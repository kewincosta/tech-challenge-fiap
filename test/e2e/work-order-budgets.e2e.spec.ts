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

/** Registering a customer does not itself grant CUSTOMER - the role controls API access, the
 * customer record controls what the actor owns, and this feature's authorizer needs both. */
async function loginAsCustomer(customer: RegisteredCustomer): Promise<AuthenticatedClient> {
  await grantRole(app, customer.userId, 'CUSTOMER');
  return login(app, customer.credentials);
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
  owner: RegisteredCustomer;
}

async function createReceivedWorkOrder(): Promise<CreatedWorkOrder> {
  const owner = await registerCustomer();
  const vehicleId = await registerVehicle(owner.customerId);
  const response = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId: owner.customerId, vehicleId })
    .expect(201);
  const body = response.body as { id: string; number: string };
  return {
    number: body.number,
    id: body.id,
    customerId: owner.customerId,
    customerUserId: owner.userId,
    owner,
  };
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

describe('Work order diagnosis and budget - supplementary cycle', () => {
  it('walks a full supplementary cycle, execution to approval to execution, ending with a wider approved scope', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const extraServiceId = await createCatalogService(3000);
    await addService(workOrder.number, extraServiceId);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/supplementary`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    const approved = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const body = approved.body as {
      status: string;
      budgets: Array<{ round: number; status: string }>;
    };
    expect(body.status).toBe('IN_EXECUTION');
    expect(body.budgets).toHaveLength(2);
    expect(body.budgets.every((budget) => budget.status === 'APPROVED')).toBe(true);
  });

  it("returns a refused round to execution with the scope it already had, its items still attached to it", async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const extraServiceId = await createCatalogService(3000);
    await addService(workOrder.number, extraServiceId);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/supplementary`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    const rejected = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/rejection`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const body = rejected.body as {
      status: string;
      budgets: Array<{ round: number; status: string }>;
      serviceItems: Array<{ serviceId: string; budgetRound: number | null }>;
    };
    expect(body.status).toBe('IN_EXECUTION');
    expect(body.budgets[1].status).toBe('REJECTED');
    const extraItem = body.serviceItems.find((item) => item.serviceId === extraServiceId);
    expect(extraItem?.budgetRound).toBe(2);
  });

  it('answers 404 from both decision routes for a customer who does not own the work order', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    const stranger = await registerCustomer();
    const strangerClient = await loginAsCustomer(stranger);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${strangerClient.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/rejection`)
      .set('Authorization', `Bearer ${strangerClient.accessToken}`)
      .expect(404);
  });

  it('lets a service advisor holding work-orders:decide approve a work order that is not theirs', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();

    const approved = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    expect((approved.body as { status: string }).status).toBe('IN_EXECUTION');
  });

  it("leaves a generated round's total and the item's budgeted price unchanged after the catalog price is edited", async () => {
    const workOrder = await createReceivedWorkOrder();
    const serviceId = await createCatalogService(15099);
    await addService(workOrder.number, serviceId);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    const completed = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    const originalTotal = (completed.body as { budgets: Array<{ totalCents: number }> }).budgets[0]
      .totalCents;

    await api(app)
      .patch(`/api/v1/services/${serviceId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ priceCents: 99999 })
      .expect(200);

    const reread = await api(app)
      .get(`/api/v1/work-orders/${workOrder.number}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const body = reread.body as {
      budgets: Array<{ totalCents: number }>;
      serviceItems: Array<{ budgetedUnitPriceCents: number }>;
    };
    expect(body.budgets[0].totalCents).toBe(originalTotal);
    expect(body.serviceItems[0].budgetedUnitPriceCents).toBe(15099);
  });

  it('shows the diagnosis start, the completion, each generated round and each decision on the trail, in chronological order', async () => {
    const workOrder = await createAwaitingApprovalWorkOrder();
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const trail = await api(app)
      .get(`/api/v1/work-orders/${workOrder.number}/trail`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const eventTypes = (trail.body as Array<{ eventType: string }>).map((entry) => entry.eventType);

    expect(eventTypes).toEqual([
      'WORK_ORDER_CREATED',
      'SERVICE_ADDED_TO_WORK_ORDER',
      'DIAGNOSIS_STARTED',
      'PART_PLANNED_FOR_WORK_ORDER',
      'DIAGNOSIS_COMPLETED',
      'BUDGET_GENERATED',
      'BUDGET_SENT',
      'BUDGET_APPROVED',
      'EXECUTION_STARTED',
    ]);
  });
});
