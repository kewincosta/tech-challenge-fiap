import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
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

async function getInventoryItem(
  inventoryItemId: string,
): Promise<{ quantityOnHand: number; unitPriceCents: number }> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as { quantityOnHand: number; unitPriceCents: number };
}

async function getMovements(
  inventoryItemId: string,
): Promise<Array<{ kind: string; quantity: number; unitPriceCents: number }>> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}/movements`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as Array<{ kind: string; quantity: number; unitPriceCents: number }>;
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

async function getWorkOrder(number: string): Promise<{ status: string; partItems: PartItem[] }> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as { status: string; partItems: PartItem[] };
}

interface InExecutionWorkOrder {
  number: string;
  inventoryItemId: string;
  approvedItemId: string;
  plannedQuantity: number;
  priceCentsAtApproval: number;
}

/**
 * Builds a work order in IN_EXECUTION carrying one approved part on round 1 - planned at
 * `plannedQuantity`, budgeted at the catalog price the moment the diagnosis was completed - with
 * `stockOnHand` already on the shelf at that same price (`test/e2e/work-order-budgets.e2e.spec.ts`'s
 * fixture shape, extended with the inventory side this feature needs control over).
 */
async function createInExecutionWorkOrder(
  plannedQuantity = 3,
  stockOnHand = 10,
  priceCents = 2500,
): Promise<InExecutionWorkOrder> {
  const owner = await registerCustomer();
  const vehicleId = await registerVehicle(owner.customerId);
  const created = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId: owner.customerId, vehicleId })
    .expect(201);
  const number = (created.body as { number: string }).number;

  const inventoryItemId = await createInventoryItem(priceCents);
  await replenish(inventoryItemId, stockOnHand, priceCents);

  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
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
  const approved = workOrder.partItems[0];
  return {
    number,
    inventoryItemId,
    approvedItemId: approved.id,
    plannedQuantity,
    priceCentsAtApproval: approved.unitPriceCents,
  };
}

describe('Work order part withdrawal - main path', () => {
  it('withdraws a batch in one call, lowers the shelf by exactly what left, and reads back planned against withdrawn', async () => {
    const workOrder = await createInExecutionWorkOrder(5, 10, 2500);

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 3 }] })
      .expect(200);
    const body = response.body as { partItems: PartItem[] };
    expect(body.partItems[0].plannedQuantity).toBe(5);
    expect(body.partItems[0].withdrawnQuantity).toBe(3);

    const item = await getInventoryItem(workOrder.inventoryItemId);
    expect(item.quantityOnHand).toBe(7);
  });

  it("answers 400 for an empty batch, through the DTO's own validation", async () => {
    const workOrder = await createInExecutionWorkOrder();

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [] })
      .expect(400);
  });

  it('answers 400 for a zero or a negative quantity', async () => {
    const workOrder = await createInExecutionWorkOrder();

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 0 }] })
      .expect(400);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: -1 }] })
      .expect(400);
  });

  it('answers 422 when a withdrawal would take an item past its planned quantity', async () => {
    const workOrder = await createInExecutionWorkOrder(2, 10, 2500);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 3 }] })
      .expect(422);
  });

  it('answers 422 for a part still on a round awaiting approval, while the already-approved line succeeds', async () => {
    const workOrder = await createInExecutionWorkOrder(2, 10, 2500);
    const draftInventoryItemId = await createInventoryItem(1500);
    await replenish(draftInventoryItemId, 10, 1500);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/parts`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ inventoryItemId: draftInventoryItemId, quantity: 1 })
      .expect(200);
    const withDraft = await getWorkOrder(workOrder.number);
    const draftItem = withDraft.partItems.find((item) => item.inventoryItemId === draftInventoryItemId);
    expect(draftItem?.budgetRound).toBeNull();

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: draftItem!.id, quantity: 1 }] })
      .expect(422);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 1 }] })
      .expect(200);
  });

  it('answers 422 when a withdrawal exceeds the shelf, leaving the count, the ledger and the work order item untouched', async () => {
    const workOrder = await createInExecutionWorkOrder(5, 2, 2500);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 3 }] })
      .expect(422);

    const item = await getInventoryItem(workOrder.inventoryItemId);
    expect(item.quantityOnHand).toBe(2);
    const movements = await getMovements(workOrder.inventoryItemId);
    expect(movements.some((movement) => movement.kind === 'CONSUMPTION')).toBe(false);
    const reread = await getWorkOrder(workOrder.number);
    expect(reread.partItems[0].withdrawnQuantity).toBe(0);
  });

  it("writes the catalog price at withdrawal time on the movement, leaving the item's budgeted price untouched", async () => {
    const workOrder = await createInExecutionWorkOrder(3, 10, 2500);
    await api(app)
      .patch(`/api/v1/inventory-items/${workOrder.inventoryItemId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ unitPriceCents: 3200 })
      .expect(200);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 1 }] })
      .expect(200);

    const movements = await getMovements(workOrder.inventoryItemId);
    const consumption = movements.find((movement) => movement.kind === 'CONSUMPTION');
    expect(consumption?.unitPriceCents).toBe(3200);
    const reread = await getWorkOrder(workOrder.number);
    expect(reread.partItems[0].budgetedUnitPriceCents).toBe(2500);
  });

  it('answers 403 to a service advisor (lacking work-orders:execute) on the withdrawals route', async () => {
    const workOrder = await createInExecutionWorkOrder();

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 1 }] })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 403 to a service advisor (lacking work-orders:execute) on the returns route', async () => {
    const workOrder = await createInExecutionWorkOrder();

    const response = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/returns`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ lines: [{ itemId: workOrder.approvedItemId, quantity: 1 }] })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('answers 404 on both routes for a work order number nobody carries', async () => {
    const unknown = 'ZZZZZZ-2026';
    const unknownItemId = '99999999-9999-4999-8999-999999999999';

    await api(app)
      .post(`/api/v1/work-orders/${unknown}/withdrawals`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: unknownItemId, quantity: 1 }] })
      .expect(404);
    await api(app)
      .post(`/api/v1/work-orders/${unknown}/returns`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ lines: [{ itemId: unknownItemId, quantity: 1 }] })
      .expect(404);
  });
});
