import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
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

interface WorkOrderDetail {
  id: string;
  number: string;
  status: string;
  serviceItems: Array<{
    id: string;
    serviceId: string;
    unitPriceCents: number;
    budgetRound: number | null;
    budgetedUnitPriceCents: number | null;
  }>;
  partItems: Array<{
    id: string;
    inventoryItemId: string;
    plannedQuantity: number;
    withdrawnQuantity: number;
    budgetRound: number | null;
  }>;
  budgets: Array<{ round: number; totalCents: number; status: string }>;
}

async function createCustomerWithVehicle(): Promise<{ customerId: string; vehicleId: string }> {
  const target = await registerUser(app);
  const customer = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: target.userId })
    .expect(201);
  const customerId = (customer.body as { id: string }).id;
  const vehicle = await api(app)
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
  return { customerId, vehicleId: (vehicle.body as { id: string }).id };
}

async function createCatalogService(priceCents = 15099): Promise<string> {
  const response = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents, estimatedDurationMinutes: 60 })
    .expect(201);
  return (response.body as { id: string }).id;
}

async function createInventoryItem(unitPriceCents = 2500): Promise<string> {
  const response = await api(app)
    .post('/api/v1/inventory-items')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ sku: uniqueSku(), name: 'Pastilha de freio', kind: 'PART', unitPriceCents })
    .expect(201);
  return (response.body as { id: string }).id;
}

/** The opening call, with the status left to the caller. */
async function openWith(
  body: Record<string, unknown>,
  accessToken: string = serviceAdvisor.accessToken,
): Promise<Response> {
  return api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
}

async function getWorkOrder(number: string): Promise<WorkOrderDetail> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as WorkOrderDetail;
}

describe('Opening a work order with items', () => {
  it('opens a work order with two services and one part as draft items', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceA = await createCatalogService(15099);
    const serviceB = await createCatalogService(12000);
    const inventoryItemId = await createInventoryItem(2500);

    const response = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId: serviceA }, { serviceId: serviceB }],
      parts: [{ inventoryItemId, quantity: 2 }],
    });

    expect(response.status).toBe(201);
    const created = response.body as { id: string; number: string };
    expect(Object.keys(created).sort()).toEqual(['id', 'number']);
    expect(created.number).toMatch(/^[A-Z0-9]{6}-\d{4}$/);
    const detail = await getWorkOrder(created.number);
    expect(detail.id).toBe(created.id);
    expect(detail.status).toBe('RECEIVED');
    expect(detail.serviceItems).toHaveLength(2);
    expect(detail.serviceItems.map((item) => item.serviceId).sort()).toEqual(
      [serviceA, serviceB].sort(),
    );
    expect(detail.serviceItems.map((item) => item.budgetRound)).toEqual([null, null]);
    expect(detail.partItems).toHaveLength(1);
    expect(detail.partItems[0]).toMatchObject({
      inventoryItemId,
      plannedQuantity: 2,
      withdrawnQuantity: 0,
      budgetRound: null,
    });
  });

  it('opens a work order with no services and no parts', async () => {
    const withoutLists = await createCustomerWithVehicle();
    const withEmptyLists = await createCustomerWithVehicle();

    const first = await openWith({
      customerId: withoutLists.customerId,
      vehicleId: withoutLists.vehicleId,
    });
    const second = await openWith({
      customerId: withEmptyLists.customerId,
      vehicleId: withEmptyLists.vehicleId,
      services: [],
      parts: [],
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    for (const response of [first, second]) {
      const detail = await getWorkOrder((response.body as { number: string }).number);
      expect(detail.status).toBe('RECEIVED');
      expect(detail.serviceItems).toEqual([]);
      expect(detail.partItems).toEqual([]);
    }
  });

  it('refuses an unknown service with 404 and opens nothing', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceA = await createCatalogService();
    const serviceB = await createCatalogService();

    const refused = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId: serviceA }, { serviceId: serviceB }, { serviceId: randomUUID() }],
    });

    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_REFERENCED_SERVICE_NOT_FOUND' });
    // A work order left behind would hold the vehicle and answer 409 here.
    const reopened = await openWith({ customerId, vehicleId });
    expect(reopened.status).toBe(201);
  });

  it('refuses an unknown inventory item with 404 and opens nothing', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceId = await createCatalogService();

    const refused = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId }],
      parts: [{ inventoryItemId: randomUUID(), quantity: 1 }],
    });

    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({
      code: 'WORK_ORDER_REFERENCED_INVENTORY_ITEM_NOT_FOUND',
    });
    const reopened = await openWith({ customerId, vehicleId });
    expect(reopened.status).toBe(201);
  });

  it('refuses an inactive service with 422 and opens nothing', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const activeService = await createCatalogService();
    const inactiveService = await createCatalogService();
    await api(app)
      .delete(`/api/v1/services/${inactiveService}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const refused = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId: activeService }, { serviceId: inactiveService }],
    });

    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_SERVICE_INACTIVE' });
    const reopened = await openWith({ customerId, vehicleId });
    expect(reopened.status).toBe(201);
  });

  it('refuses an inactive inventory item with 422 and opens nothing', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceId = await createCatalogService();
    const inactiveItem = await createInventoryItem();
    await api(app)
      .delete(`/api/v1/inventory-items/${inactiveItem}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const refused = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId }],
      parts: [{ inventoryItemId: inactiveItem, quantity: 1 }],
    });

    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_INVENTORY_ITEM_INACTIVE' });
    const reopened = await openWith({ customerId, vehicleId });
    expect(reopened.status).toBe(201);
  });

  it('refuses quantity 0 and an item without its id with 400, and accepts quantity 1', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceId = await createCatalogService();
    const inventoryItemId = await createInventoryItem();

    const zeroQuantity = await openWith({
      customerId,
      vehicleId,
      parts: [{ inventoryItemId, quantity: 0 }],
    });
    const serviceWithoutId = await openWith({ customerId, vehicleId, services: [{}] });
    const partWithoutId = await openWith({ customerId, vehicleId, parts: [{ quantity: 1 }] });
    const partWithoutQuantity = await openWith({
      customerId,
      vehicleId,
      parts: [{ inventoryItemId }],
    });

    for (const refused of [zeroQuantity, serviceWithoutId, partWithoutId, partWithoutQuantity]) {
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    // None of the four opened a work order, so the vehicle takes the one that is valid.
    const accepted = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId }],
      parts: [{ inventoryItemId, quantity: 1 }],
    });
    expect(accepted.status).toBe(201);
    const detail = await getWorkOrder((accepted.body as { number: string }).number);
    expect(detail.partItems).toMatchObject([{ inventoryItemId, plannedQuantity: 1 }]);
  });

  it('plans a part on a RECEIVED work order and refuses it on a COMPLETED one', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const inventoryItemId = await createInventoryItem();
    const opened = await openWith({ customerId, vehicleId });
    const number = (opened.body as { number: string }).number;

    const planned = await api(app)
      .post(`/api/v1/work-orders/${number}/parts`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ inventoryItemId, quantity: 3 })
      .expect(200);

    const plannedBody = planned.body as WorkOrderDetail;
    expect(plannedBody.status).toBe('RECEIVED');
    expect(plannedBody.partItems).toMatchObject([
      { inventoryItemId, plannedQuantity: 3, withdrawnQuantity: 0, budgetRound: null },
    ]);

    const completed = await createCompletedWorkOrder();
    const refused = await api(app)
      .post(`/api/v1/work-orders/${completed}/parts`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ inventoryItemId, quantity: 1 })
      .expect(422);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_INVALID_STATE' });
    expect((await getWorkOrder(completed)).status).toBe('COMPLETED');
  });

  it('builds round 1 from the items left after the diagnosis', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceA = await createCatalogService(15099);
    const serviceB = await createCatalogService(7000);
    const serviceC = await createCatalogService(3000);
    const partP = await createInventoryItem(2500);
    const opened = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId: serviceA }, { serviceId: serviceB }],
      parts: [{ inventoryItemId: partP, quantity: 2 }],
    });
    const number = (opened.body as { number: string }).number;
    await api(app)
      .post(`/api/v1/work-orders/${number}/diagnosis`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    const duringDiagnosis = await getWorkOrder(number);
    const itemOfB = duringDiagnosis.serviceItems.find((item) => item.serviceId === serviceB)!;
    await api(app)
      .delete(`/api/v1/work-orders/${number}/items/${itemOfB.id}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(204);
    await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId: serviceC })
      .expect(200);

    await api(app)
      .post(`/api/v1/work-orders/${number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);

    const detail = await getWorkOrder(number);
    expect(detail.status).toBe('AWAITING_APPROVAL');
    expect(detail.serviceItems.map((item) => item.serviceId).sort()).toEqual(
      [serviceA, serviceC].sort(),
    );
    expect(detail.serviceItems.map((item) => item.budgetRound)).toEqual([1, 1]);
    expect(detail.partItems).toMatchObject([{ inventoryItemId: partP, budgetRound: 1 }]);
    // A 150.99, C 30.00 and 2 x 25.00 of P. B (70.00) is not in the round.
    expect(detail.budgets).toMatchObject([{ round: 1, totalCents: 15099 + 3000 + 2 * 2500 }]);
  });

  it('refuses a vehicle that already has an active work order with 409', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceId = await createCatalogService();
    const inventoryItemId = await createInventoryItem();
    const first = await openWith({ customerId, vehicleId });
    expect(first.status).toBe(201);

    const second = await openWith({
      customerId,
      vehicleId,
      services: [{ serviceId }],
      parts: [{ inventoryItemId, quantity: 1 }],
    });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      code: 'WORK_ORDER_VEHICLE_ALREADY_HAS_ACTIVE_WORK_ORDER',
    });
  });

  it('answers 401 without a token and 403 without work-orders:manage', async () => {
    const { customerId, vehicleId } = await createCustomerWithVehicle();
    const serviceId = await createCatalogService();
    const body = { customerId, vehicleId, services: [{ serviceId }] };

    const withoutToken = await api(app).post('/api/v1/work-orders').send(body);
    const withoutPermission = await openWith(body, mechanic.accessToken);

    expect(withoutToken.status).toBe(401);
    expect(withoutPermission.status).toBe(403);
    expect(withoutPermission.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
    // Neither refused call opened a work order.
    const opened = await openWith({ customerId, vehicleId });
    expect(opened.status).toBe(201);
  });
});

/** Walks a work order from the opening to COMPLETED through the API and returns its number. */
async function createCompletedWorkOrder(): Promise<string> {
  const { customerId, vehicleId } = await createCustomerWithVehicle();
  const serviceId = await createCatalogService();
  const opened = await openWith({ customerId, vehicleId, services: [{ serviceId }] });
  const number = (opened.body as { number: string }).number;
  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/budget/approval`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  return number;
}
