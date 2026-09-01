import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueSku } from '../support/factories/sku.factory';
import { api, grantRole, login, registerUser, type AuthenticatedClient } from '../support/http';

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

async function registerCustomer(): Promise<{ customerId: string }> {
  const target = await registerUser(app);
  const response = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: target.userId })
    .expect(201);
  return { customerId: (response.body as { id: string }).id };
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

async function getInventoryItem(inventoryItemId: string): Promise<{ quantityOnHand: number }> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as { quantityOnHand: number };
}

interface Movement {
  kind: string;
  quantity: number;
  status: string | null;
}

async function getMovements(inventoryItemId: string): Promise<Movement[]> {
  const response = await api(app)
    .get(`/api/v1/inventory-items/${inventoryItemId}/movements`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as Movement[];
}

interface PartItem {
  id: string;
  inventoryItemId: string;
  withdrawnQuantity: number;
}

interface WorkOrderDetail {
  status: string;
  partItems: PartItem[];
}

async function getWorkOrder(number: string): Promise<WorkOrderDetail> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as WorkOrderDetail;
}

interface InExecutionWorkOrder {
  number: string;
  inventoryItemId: string;
  itemId: string;
  assigneeAccessToken: string;
}

/**
 * Builds a work order in `IN_EXECUTION` carrying one approved part planned at `plannedQuantity`,
 * with `stockOnHand` already on the shelf - the same shape
 * `test/e2e/work-order-withdrawals.e2e.spec.ts` uses, without the service item this feature's
 * concurrency proof does not need.
 */
async function createInExecutionWorkOrder(
  plannedQuantity: number,
  stockOnHand: number,
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
  const item = workOrder.partItems[0];

  return { number, inventoryItemId, itemId: item.id, assigneeAccessToken: mechanic.accessToken };
}

describe('Work order concurrency - the version guard', () => {
  it('answers one 200 and one 409 for two concurrent withdrawals of 3, rather than the two 200s a lost update would answer', async () => {
    const workOrder = await createInExecutionWorkOrder(6, 20);

    const [first, second] = await Promise.all([
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
    ]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([200, 409]);
    expect((second.status === 409 ? second : first).body).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });
  });

  it("leaves the units that left the shelf equal to the work order's withdrawn quantity after the race - the assertion a lost update fails", async () => {
    const workOrder = await createInExecutionWorkOrder(6, 20);

    await Promise.all([
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
    ]);

    const detail = await getWorkOrder(workOrder.number);
    const inventoryItem = await getInventoryItem(workOrder.inventoryItemId);
    const consumed = 20 - inventoryItem.quantityOnHand;

    expect(detail.partItems[0].withdrawnQuantity).toBe(consumed);
  });

  it('lets the refused call succeed on a retry, and then correctly refuses a further withdrawal that would exceed the planned quantity', async () => {
    const workOrder = await createInExecutionWorkOrder(6, 20);

    const [first, second] = await Promise.all([
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] }),
    ]);
    const loser = first.status === 409 ? first : second;
    expect(loser.status).toBe(409);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .send({ lines: [{ itemId: workOrder.itemId, quantity: 3 }] })
      .expect(200);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .send({ lines: [{ itemId: workOrder.itemId, quantity: 1 }] })
      .expect(422);
  });

  it('never ends with a pending consumption on a cancelled work order, when a cancellation races a withdrawal', async () => {
    const workOrder = await createInExecutionWorkOrder(6, 20);

    const [cancelResult, withdrawResult] = await Promise.all([
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/cancellation`)
        .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
        .send({ reason: 'Cliente desistiu do servico' }),
      api(app)
        .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
        .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
        .send({ lines: [{ itemId: workOrder.itemId, quantity: 1 }] }),
    ]);
    const statuses = [cancelResult.status, withdrawResult.status].sort();
    expect(statuses).toEqual([200, 409]);

    const detail = await getWorkOrder(workOrder.number);
    if (detail.status === 'CANCELED') {
      const movements = await getMovements(workOrder.inventoryItemId);
      expect(movements.some((movement) => movement.status === 'PENDING')).toBe(false);
    }
  });

  it('never answers 409 on sequential calls to the same work order, so the guard does not refuse honest traffic', async () => {
    const workOrder = await createInExecutionWorkOrder(6, 20);

    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .send({ lines: [{ itemId: workOrder.itemId, quantity: 2 }] })
      .expect(200);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/withdrawals`)
      .set('Authorization', `Bearer ${workOrder.assigneeAccessToken}`)
      .send({ lines: [{ itemId: workOrder.itemId, quantity: 2 }] })
      .expect(200);
  });
});
