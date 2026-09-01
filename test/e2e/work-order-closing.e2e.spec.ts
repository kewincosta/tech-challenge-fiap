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

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

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

async function createCatalogService(priceCents: number): Promise<string> {
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents, estimatedDurationMinutes: 60 })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createInventoryItem(priceCents: number): Promise<string> {
  const response = await api(app)
    .post('/api/v1/inventory-items')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ sku: uniqueSku(), name: 'Filtro de oleo', kind: 'PART', unitPriceCents: priceCents })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function replenish(inventoryItemId: string, quantity: number, priceCents: number): Promise<void> {
  await api(app)
    .post(`/api/v1/inventory-items/${inventoryItemId}/replenishments`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ quantity, unitPriceCents: priceCents, note: 'Reposicao inicial' })
    .expect(200);
}

interface Movement {
  id: string;
  kind: string;
  quantity: number;
  unitPriceCents: number;
  status: string | null;
  workOrderId: string | null;
  undoesMovementId: string | null;
}

async function getMovements(inventoryItemId: string): Promise<Movement[]> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}/movements`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as Movement[];
}

async function getInventoryItem(inventoryItemId: string): Promise<{ quantityOnHand: number }> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as { quantityOnHand: number };
}

interface PartItem {
  id: string;
  inventoryItemId: string;
  plannedQuantity: number;
  withdrawnQuantity: number;
  unitPriceCents: number;
  budgetRound: number | null;
  budgetedUnitPriceCents: number | null;
}

interface WorkOrderDetail {
  id: string;
  status: string;
  partItems: PartItem[];
  chargedTotalCents: number | null;
  discountCents: number;
  discountNote: string | null;
  completedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
}

async function getWorkOrder(number: string): Promise<WorkOrderDetail> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as WorkOrderDetail;
}

interface TrailEntry {
  eventType: string;
  actorUserId: string;
}

async function getTrail(number: string): Promise<TrailEntry[]> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}/trail`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as TrailEntry[];
}

interface InExecutionWorkOrder {
  number: string;
  id: string;
  inventoryItemId: string;
  assigneeAccessToken: string;
  servicePriceCents: number;
  partPriceCents: number;
  plannedQuantity: number;
}

/**
 * Builds a work order in `IN_EXECUTION` carrying one approved service and one approved part on
 * round 1 - the acting mechanic becomes the assignee via `startDiagnosis`'s auto-assignment,
 * matching `test/e2e/work-order-withdrawals.e2e.spec.ts`'s shape, extended with a service item so
 * the charged total this feature computes has more than one line to sum.
 */
async function createInExecutionWorkOrder(
  servicePriceCents = 15099,
  partPriceCents = 2500,
  plannedQuantity = 2,
  stockOnHand = 10,
): Promise<InExecutionWorkOrder> {
  const owner = await registerCustomer();
  const vehicleId = await registerVehicle(owner.customerId);
  const created = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId: owner.customerId, vehicleId })
    .expect(201);
  const number = (created.body as { number: string }).number;

  const serviceId = await createCatalogService(servicePriceCents);
  await api(app)
    .post(`/api/v1/work-orders/${number}/services`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ serviceId })
    .expect(200);

  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);

  const inventoryItemId = await createInventoryItem(partPriceCents);
  await replenish(inventoryItemId, stockOnHand, partPriceCents);
  await api(app)
    .post(`/api/v1/work-orders/${number}/parts`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ inventoryItemId, quantity: plannedQuantity })
    .expect(200);

  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/budget/approval`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .expect(200);

  const workOrder = await getWorkOrder(number);
  expect(workOrder.status).toBe('IN_EXECUTION');

  return {
    number,
    id: workOrder.id,
    inventoryItemId,
    assigneeAccessToken: mechanic.accessToken,
    servicePriceCents,
    partPriceCents,
    plannedQuantity,
  };
}

async function withdraw(number: string, itemId: string, quantity: number, accessToken: string): Promise<void> {
  const workOrder = await getWorkOrder(number);
  const line = workOrder.partItems.find((item) => item.inventoryItemId === itemId);
  if (!line) throw new Error('part item not found');
  await api(app)
    .post(`/api/v1/work-orders/${number}/withdrawals`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ lines: [{ itemId: line.id, quantity }] })
    .expect(200);
}

describe('Work order closing - main path', () => {
  it('walks creation to delivery, ending DELIVERED with the charged total equal to the approved services plus the withdrawn parts', async () => {
    const workOrder = await createInExecutionWorkOrder(15099, 2500, 2, 10);
    await withdraw(workOrder.number, workOrder.inventoryItemId, 2, workOrder.assigneeAccessToken);

    const completed = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/completion`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .expect(200);
    const completedBody = completed.body as WorkOrderDetail;
    expect(completedBody.status).toBe('COMPLETED');
    expect(completedBody.chargedTotalCents).toBe(15099 + 2 * 2500);

    const delivered = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const deliveredBody = delivered.body as WorkOrderDetail;
    expect(deliveredBody.status).toBe('DELIVERED');
    expect(deliveredBody.chargedTotalCents).toBe(15099 + 2 * 2500);
    expect(deliveredBody.deliveredAt).not.toBeNull();
  });

  it("shows the consumption SETTLED and leaves the count on hand unchanged by the settlement, after delivery", async () => {
    const workOrder = await createInExecutionWorkOrder(15099, 2500, 2, 10);
    await withdraw(workOrder.number, workOrder.inventoryItemId, 2, workOrder.assigneeAccessToken);
    const afterWithdrawal = await getInventoryItem(workOrder.inventoryItemId);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/completion`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .expect(200);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const movements = await getMovements(workOrder.inventoryItemId);
    const consumption = movements.find((movement) => movement.kind === 'CONSUMPTION');
    expect(consumption?.status).toBe('SETTLED');
    const afterDelivery = await getInventoryItem(workOrder.inventoryItemId);
    expect(afterDelivery.quantityOnHand).toBe(afterWithdrawal.quantityOnHand);
  });

  it('reads back a null charged total before completion', async () => {
    const workOrder = await createInExecutionWorkOrder();

    const detail = await getWorkOrder(workOrder.number);

    expect(detail.chargedTotalCents).toBeNull();
  });

  it('answers 403 when a mechanic who is not the assignee completes the work order', async () => {
    const workOrder = await createInExecutionWorkOrder();
    await withdraw(workOrder.number, workOrder.inventoryItemId, workOrder.plannedQuantity, workOrder.assigneeAccessToken);
    const otherMechanic = await loginAs('MECHANIC');

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/completion`)
      .set('Authorization', `Bearer ${otherMechanic.accessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'WORK_ORDER_COMPLETION_FORBIDDEN' });
  });

  it('answers 422 when delivering a work order still in RECEIVED', async () => {
    const owner = await registerCustomer();
    const vehicleId = await registerVehicle(owner.customerId);
    const created = await api(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ customerId: owner.customerId, vehicleId })
      .expect(201);
    const number = (created.body as { number: string }).number;

    await api(app)
      .post(`/api/v1/work-orders/${number}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(422);
  });

  it('answers 403 when delivering without work-orders:manage, its own test rather than the completion route standing in', async () => {
    const workOrder = await createInExecutionWorkOrder();
    await withdraw(workOrder.number, workOrder.inventoryItemId, workOrder.plannedQuantity, workOrder.assigneeAccessToken);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/completion`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/delivery`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 404 for both completion and delivery on a work order number nobody carries', async () => {
    const unknown = 'ZZZZZZ-2026';
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/completion`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(404);
  });

  it('shows the completion and the delivery on the trail, each naming its own actor', async () => {
    const workOrder = await createInExecutionWorkOrder();
    await withdraw(workOrder.number, workOrder.inventoryItemId, workOrder.plannedQuantity, workOrder.assigneeAccessToken);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/completion`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .expect(200);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const trail = await getTrail(workOrder.number);
    const completion = trail.find((entry) => entry.eventType === 'WORK_ORDER_COMPLETED');
    const delivery = trail.find((entry) => entry.eventType === 'VEHICLE_DELIVERED');
    expect(completion?.actorUserId).toBeTruthy();
    expect(delivery?.actorUserId).toBeTruthy();
  });
});
