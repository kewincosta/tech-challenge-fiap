import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
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

interface BoardPage {
  items: Array<{ id: string; number: string; status: string }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** The board as a service advisor reads it; the query is sent as given. */
async function readBoard(query: Record<string, string | number>): Promise<Response> {
  return api(app)
    .get('/api/v1/work-orders')
    .query(query)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`);
}

async function readBoardPage(query: Record<string, string | number>): Promise<BoardPage> {
  const response = await readBoard(query);
  expect(response.status).toBe(200);
  return response.body as BoardPage;
}

/** The last page of a listing at 100 a page: the first read gives the total, the second the page. */
async function readLastPage(status?: string): Promise<BoardPage> {
  const filter: Record<string, string> = status === undefined ? {} : { status };
  const first = await readBoardPage({ ...filter, page: 1, pageSize: 100 });
  const lastPage = Math.ceil(first.totalItems / 100);
  return lastPage <= 1 ? first : readBoardPage({ ...filter, page: lastPage, pageSize: 100 });
}

type Stage = 'RECEIVED' | 'COMPLETED' | 'DELIVERED' | 'CANCELED';

/** Opens a work order on a customer and a vehicle of its own and takes it to `stage`. */
async function createWorkOrderAt(stage: Stage): Promise<{ id: string; number: string }> {
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
  const opened = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId, vehicleId: (vehicle.body as { id: string }).id })
    .expect(201);
  const created = opened.body as { id: string; number: string };
  if (stage === 'RECEIVED') {
    return created;
  }
  if (stage === 'CANCELED') {
    await api(app)
      .post(`/api/v1/work-orders/${created.number}/cancellation`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Customer decided to postpone the service' })
      .expect(200);
    return created;
  }
  const service = await api(app)
    .post('/api/v1/services')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ name: uniqueServiceName(), priceCents: 15099, estimatedDurationMinutes: 60 })
    .expect(201);
  await api(app)
    .post(`/api/v1/work-orders/${created.number}/services`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ serviceId: (service.body as { id: string }).id })
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${created.number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${created.number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${created.number}/budget/approval`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${created.number}/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  if (stage === 'DELIVERED') {
    await api(app)
      .post(`/api/v1/work-orders/${created.number}/delivery`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
  }
  return created;
}

describe('The paginated board', () => {
  it('validates page, pageSize and status', async () => {
    const cases: Array<{
      name: string;
      query: Record<string, string | number>;
      expectedStatus: number;
    }> = [
      { name: 'no pageSize', query: { page: 1 }, expectedStatus: 400 },
      { name: 'pageSize 101', query: { page: 1, pageSize: 101 }, expectedStatus: 400 },
      { name: 'pageSize 100', query: { page: 1, pageSize: 100 }, expectedStatus: 200 },
      { name: 'page 0', query: { page: 0, pageSize: 20 }, expectedStatus: 400 },
      { name: 'status=FOO', query: { page: 1, pageSize: 20, status: 'FOO' }, expectedStatus: 400 },
      {
        name: 'status=RECEIVED,FOO',
        query: { page: 1, pageSize: 20, status: 'RECEIVED,FOO' },
        expectedStatus: 400,
      },
      { name: 'no page', query: { pageSize: 20 }, expectedStatus: 400 },
      { name: 'no pagination at all', query: {}, expectedStatus: 400 },
      { name: 'pageSize 0', query: { page: 1, pageSize: 0 }, expectedStatus: 400 },
      {
        name: 'a page that is not a number',
        query: { page: 'one', pageSize: 20 },
        expectedStatus: 400,
      },
      { name: 'a page that is not whole', query: { page: 1.5, pageSize: 20 }, expectedStatus: 400 },
      { name: 'pageSize 1', query: { page: 1, pageSize: 1 }, expectedStatus: 200 },
      {
        name: 'a query parameter the board does not know',
        query: { page: 1, pageSize: 20, colour: 'red' },
        expectedStatus: 400,
      },
      {
        name: 'status in lower case',
        query: { page: 1, pageSize: 20, status: 'received' },
        expectedStatus: 400,
      },
      {
        name: 'status=CANCELED,DELIVERED',
        query: { page: 1, pageSize: 20, status: 'CANCELED,DELIVERED' },
        expectedStatus: 200,
      },
    ];

    for (const { name, query, expectedStatus } of cases) {
      const response = await readBoard(query);

      expect(response.status, name).toBe(expectedStatus);
      if (expectedStatus === 400) {
        expect(response.body, name).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
    }
  });

  it('answers an empty page for a page number beyond any offset a query can take', async () => {
    const first = await readBoardPage({ page: 1, pageSize: 20 });

    const beyond = await readBoard({ page: 100000000000000000000, pageSize: 20 });

    expect(beyond.status).toBe(200);
    expect(beyond.body).toMatchObject({
      items: [],
      pageSize: 20,
      totalItems: first.totalItems,
      totalPages: first.totalPages,
    });
  });

  it('answers the page envelope with the newest RECEIVED work order last', async () => {
    const opened = await createWorkOrderAt('RECEIVED');

    const firstPage = await readBoardPage({ status: 'RECEIVED', page: 1, pageSize: 100 });
    const expectedLastPage = Math.ceil(firstPage.totalItems / 100);
    const lastPage = await readBoardPage({
      status: 'RECEIVED',
      page: expectedLastPage,
      pageSize: 100,
    });

    expect(Object.keys(lastPage).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'totalItems',
      'totalPages',
    ]);
    expect(lastPage).toMatchObject({
      page: expectedLastPage,
      pageSize: 100,
      totalItems: firstPage.totalItems,
      totalPages: expectedLastPage,
    });
    expect(lastPage.items.length).toBeGreaterThan(0);
    expect(lastPage.items.length).toBeLessThanOrEqual(100);
    expect(lastPage.items.every((item) => item.status === 'RECEIVED')).toBe(true);
    expect(lastPage.items[lastPage.items.length - 1].id).toBe(opened.id);
  });

  it('leaves completed, delivered and canceled work orders out by default', async () => {
    const completed = await createWorkOrderAt('COMPLETED');
    const delivered = await createWorkOrderAt('DELIVERED');
    const canceled = await createWorkOrderAt('CANCELED');

    // The closed ones exist, and their own filters find them.
    const closedLastPages = {
      COMPLETED: await readLastPage('COMPLETED'),
      DELIVERED: await readLastPage('DELIVERED'),
      CANCELED: await readLastPage('CANCELED'),
    };
    expect(closedLastPages.COMPLETED.items.map((item) => item.id)).toContain(completed.id);
    expect(closedLastPages.DELIVERED.items.map((item) => item.id)).toContain(delivered.id);
    expect(closedLastPages.CANCELED.items.map((item) => item.id)).toContain(canceled.id);

    // Closed orders sort after the open ones, so they would fill the last page of a board that
    // listed them.
    const lastPage = await readLastPage();
    const closed = ['COMPLETED', 'DELIVERED', 'CANCELED'];
    expect(lastPage.items.some((item) => closed.includes(item.status))).toBe(false);
    const listedIds = lastPage.items.map((item) => item.id);
    for (const order of [completed, delivered, canceled]) {
      expect(listedIds).not.toContain(order.id);
    }

    // The board counts exactly the four open statuses.
    const board = await readBoardPage({ page: 1, pageSize: 1 });
    let openTotal = 0;
    for (const status of ['IN_EXECUTION', 'AWAITING_APPROVAL', 'IN_DIAGNOSIS', 'RECEIVED']) {
      openTotal += (await readBoardPage({ status, page: 1, pageSize: 1 })).totalItems;
    }
    expect(board.totalItems).toBe(openTotal);
  });

  it('answers 401 without a token and 403 without work-orders:read', async () => {
    const outsider = await registerAndLogin(app);
    const query = { page: 1, pageSize: 20 };

    const withoutToken = await api(app).get('/api/v1/work-orders').query(query);
    const withoutPermission = await api(app)
      .get('/api/v1/work-orders')
      .query(query)
      .set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(withoutToken.status).toBe(401);
    expect(withoutPermission.status).toBe(403);
    expect(withoutPermission.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
