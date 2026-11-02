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

interface BudgetView {
  id: string;
  round: number;
  status: string;
  totalCents: number;
  decidedByUserId: string | null;
  approvalUrl: string | null;
  rejectionUrl: string | null;
}

interface WorkOrderView {
  id: string;
  number: string;
  status: string;
  budgets: BudgetView[];
}

interface QuotedWorkOrder {
  number: string;
  id: string;
  owner: AuthenticatedClient;
  customerId: string;
}

const PUBLIC_URL = process.env.APP_PUBLIC_URL;

function approvalUrlOf(number: string, budgetId: string): string {
  return `${PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/approval`;
}

function rejectionUrlOf(number: string, budgetId: string): string {
  return `${PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/rejection`;
}

/** The link as the e-mail and the answer carry it, called the way a client would: its path, POST. */
async function postLink(url: string, token?: string): Promise<Response> {
  const request = api(app).post(new URL(url).pathname);
  return token === undefined ? request : request.set('Authorization', `Bearer ${token}`);
}

async function getWorkOrder(number: string): Promise<WorkOrderView> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as WorkOrderView;
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
    .send({ sku: uniqueSku(), name: 'Filtro de oleo', kind: 'PART', unitPriceCents })
    .expect(201);
  return (response.body as { id: string }).id;
}

/** A customer with an account that can sign in, a customer record and one vehicle. */
async function registerCustomerWithVehicle(): Promise<{
  customerId: string;
  vehicleId: string;
  owner: AuthenticatedClient;
}> {
  const credentials = await registerUser(app);
  const customer = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: credentials.userId })
    .expect(201);
  const customerId = (customer.body as { id: string }).id;
  await grantRole(app, credentials.userId, 'CUSTOMER');
  const owner = await login(app, credentials);
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
  return { customerId, vehicleId: (vehicle.body as { id: string }).id, owner };
}

/** Opens a work order with a service and a part, and takes it to AWAITING_APPROVAL on round 1. */
async function quoteRoundOne(): Promise<QuotedWorkOrder> {
  const { customerId, vehicleId, owner } = await registerCustomerWithVehicle();
  const serviceId = await createCatalogService(15099);
  const inventoryItemId = await createInventoryItem(2500);
  const opened = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({
      customerId,
      vehicleId,
      services: [{ serviceId }],
      parts: [{ inventoryItemId, quantity: 2 }],
    })
    .expect(201);
  const { id, number } = opened.body as { id: string; number: string };
  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/diagnosis/completion`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
  return { number, id, owner, customerId };
}

/** Adds a service during the execution and sends it as round 2, leaving it AWAITING_APPROVAL. */
async function sendRoundTwo(number: string): Promise<void> {
  await api(app)
    .post(`/api/v1/work-orders/${number}/services`)
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ serviceId: await createCatalogService(5000) })
    .expect(200);
  await api(app)
    .post(`/api/v1/work-orders/${number}/budget/supplementary`)
    .set('Authorization', `Bearer ${mechanic.accessToken}`)
    .expect(200);
}

/** Round 1 approved through the round-less route and round 2 sent: two rounds, the second pending. */
async function quoteRoundTwo(): Promise<QuotedWorkOrder> {
  const workOrder = await quoteRoundOne();
  await api(app)
    .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
    .set('Authorization', `Bearer ${workOrder.owner.accessToken}`)
    .expect(200);
  await sendRoundTwo(workOrder.number);
  return workOrder;
}

describe('Budget decision links', () => {
  it('carries both links on the pending round 1', async () => {
    const workOrder = await quoteRoundOne();

    const detail = await getWorkOrder(workOrder.number);

    expect(detail.status).toBe('AWAITING_APPROVAL');
    expect(detail.budgets).toHaveLength(1);
    const [round1] = detail.budgets;
    expect(round1.status).toBe('PENDING');
    expect(round1.approvalUrl).toBe(approvalUrlOf(workOrder.number, round1.id));
    expect(round1.rejectionUrl).toBe(rejectionUrlOf(workOrder.number, round1.id));
    expect(round1.rejectionUrl!.endsWith('/rejection')).toBe(true);
  });

  it('moves the links to round 2 once round 1 is decided', async () => {
    const workOrder = await quoteRoundTwo();

    const detail = await getWorkOrder(workOrder.number);

    expect(detail.budgets.map((budget) => [budget.round, budget.status])).toEqual([
      [1, 'APPROVED'],
      [2, 'PENDING'],
    ]);
    const [round1, round2] = detail.budgets;
    expect(round1.approvalUrl).toBeNull();
    expect(round1.rejectionUrl).toBeNull();
    expect(round2.approvalUrl).toBe(approvalUrlOf(workOrder.number, round2.id));
    expect(round2.rejectionUrl).toBe(rejectionUrlOf(workOrder.number, round2.id));
  });

  it("approves the pending budget through its approval link with the customer's token", async () => {
    const workOrder = await quoteRoundOne();
    const { approvalUrl } = (await getWorkOrder(workOrder.number)).budgets[0];

    const approved = await postLink(approvalUrl!, workOrder.owner.accessToken);

    expect(approved.status).toBe(200);
    const body = approved.body as WorkOrderView;
    expect(body.status).toBe('IN_EXECUTION');
    expect(body.budgets).toHaveLength(1);
    expect(body.budgets[0]).toMatchObject({
      status: 'APPROVED',
      decidedByUserId: workOrder.owner.userId,
      approvalUrl: null,
      rejectionUrl: null,
    });
    expect((await getWorkOrder(workOrder.number)).status).toBe('IN_EXECUTION');
  });

  it('rejects round 1 to IN_DIAGNOSIS and round 2 to IN_EXECUTION through the rejection link', async () => {
    const roundOne = await quoteRoundOne();
    const roundOneLink = (await getWorkOrder(roundOne.number)).budgets[0].rejectionUrl!;
    const roundTwo = await quoteRoundTwo();
    const roundTwoLink = (await getWorkOrder(roundTwo.number)).budgets[1].rejectionUrl!;

    const rejectedRoundOne = await postLink(roundOneLink, roundOne.owner.accessToken);
    const rejectedRoundTwo = await postLink(roundTwoLink, roundTwo.owner.accessToken);

    expect(rejectedRoundOne.status).toBe(200);
    expect(rejectedRoundOne.body).toMatchObject({
      status: 'IN_DIAGNOSIS',
      budgets: [{ round: 1, status: 'REJECTED', approvalUrl: null, rejectionUrl: null }],
    });
    expect(rejectedRoundTwo.status).toBe(200);
    expect(rejectedRoundTwo.body).toMatchObject({
      status: 'IN_EXECUTION',
      budgets: [
        { round: 1, status: 'APPROVED' },
        { round: 2, status: 'REJECTED', approvalUrl: null, rejectionUrl: null },
      ],
    });
  });

  it('refuses the approval link of a budget that is not pending with 422', async () => {
    const workOrder = await quoteRoundOne();
    const roundOneLink = (await getWorkOrder(workOrder.number)).budgets[0].approvalUrl!;
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/budget/approval`)
      .set('Authorization', `Bearer ${workOrder.owner.accessToken}`)
      .expect(200);
    await sendRoundTwo(workOrder.number);

    const refused = await postLink(roundOneLink, workOrder.owner.accessToken);

    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: 'BUDGET_INVALID_STATE' });
    const detail = await getWorkOrder(workOrder.number);
    expect(detail.status).toBe('AWAITING_APPROVAL');
    expect(detail.budgets.map((budget) => [budget.round, budget.status])).toEqual([
      [1, 'APPROVED'],
      [2, 'PENDING'],
    ]);
    expect(detail.budgets[1].approvalUrl).toBe(
      approvalUrlOf(workOrder.number, detail.budgets[1].id),
    );
  });

  it('refuses the rejection link of a budget that is not pending with 422', async () => {
    const decidedWhileAwaiting = await quoteRoundOne();
    const awaitingLinks = (await getWorkOrder(decidedWhileAwaiting.number)).budgets[0];
    await api(app)
      .post(`/api/v1/work-orders/${decidedWhileAwaiting.number}/budget/approval`)
      .set('Authorization', `Bearer ${decidedWhileAwaiting.owner.accessToken}`)
      .expect(200);
    await sendRoundTwo(decidedWhileAwaiting.number);
    const decidedInExecution = await quoteRoundOne();
    const executionLinks = (await getWorkOrder(decidedInExecution.number)).budgets[0];
    const approvedInExecution = await postLink(
      executionLinks.approvalUrl!,
      decidedInExecution.owner.accessToken,
    );
    expect(approvedInExecution.status).toBe(200);

    // Round 1 is decided while round 2 awaits, and decided while the work order is in execution.
    const whileAwaiting = await postLink(
      awaitingLinks.rejectionUrl!,
      decidedWhileAwaiting.owner.accessToken,
    );
    const whileInExecution = await postLink(
      executionLinks.rejectionUrl!,
      decidedInExecution.owner.accessToken,
    );

    for (const refused of [whileAwaiting, whileInExecution]) {
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'BUDGET_INVALID_STATE' });
    }
    const awaiting = await getWorkOrder(decidedWhileAwaiting.number);
    expect(awaiting.status).toBe('AWAITING_APPROVAL');
    expect(awaiting.budgets.map((budget) => budget.status)).toEqual(['APPROVED', 'PENDING']);
    const inExecution = await getWorkOrder(decidedInExecution.number);
    expect(inExecution.status).toBe('IN_EXECUTION');
    expect(inExecution.budgets.map((budget) => budget.status)).toEqual(['APPROVED']);
  });

  it('refuses an approval link whose budget belongs to another work order with 404', async () => {
    const first = await quoteRoundOne();
    const second = await quoteRoundOne();
    const budgetOfSecond = (await getWorkOrder(second.number)).budgets[0];

    const refused = await postLink(
      approvalUrlOf(first.number, budgetOfSecond.id),
      first.owner.accessToken,
    );

    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_BUDGET_NOT_FOUND' });
    expect((await getWorkOrder(first.number)).status).toBe('AWAITING_APPROVAL');
    expect((await getWorkOrder(second.number)).budgets[0].status).toBe('PENDING');
  });

  it('refuses a rejection link whose budget belongs to another work order with 404', async () => {
    const first = await quoteRoundOne();
    const second = await quoteRoundOne();
    const budgetOfSecond = (await getWorkOrder(second.number)).budgets[0];

    const refused = await postLink(
      rejectionUrlOf(first.number, budgetOfSecond.id),
      first.owner.accessToken,
    );

    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_BUDGET_NOT_FOUND' });
    expect((await getWorkOrder(first.number)).status).toBe('AWAITING_APPROVAL');
    expect((await getWorkOrder(second.number)).budgets[0].status).toBe('PENDING');
  });

  it('answers 404 to another customer and 401 without a token on both links', async () => {
    const workOrder = await quoteRoundOne();
    const { approvalUrl, rejectionUrl } = (await getWorkOrder(workOrder.number)).budgets[0];
    const stranger = (await registerCustomerWithVehicle()).owner;

    const strangerApproval = await postLink(approvalUrl!, stranger.accessToken);
    const strangerRejection = await postLink(rejectionUrl!, stranger.accessToken);
    // A stranger who guesses wrong learns no more than one who has the right address.
    const strangerGuess = await postLink(
      approvalUrlOf(workOrder.number, randomUUID()),
      stranger.accessToken,
    );
    const anonymousApproval = await postLink(approvalUrl!);
    const anonymousRejection = await postLink(rejectionUrl!);

    for (const refused of [strangerApproval, strangerRejection, strangerGuess]) {
      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ code: 'WORK_ORDER_NOT_FOUND' });
    }
    expect(anonymousApproval.status).toBe(401);
    expect(anonymousRejection.status).toBe(401);
    const detail = await getWorkOrder(workOrder.number);
    expect(detail.status).toBe('AWAITING_APPROVAL');
    expect(detail.budgets[0].status).toBe('PENDING');
  });

  it('lets a holder of work-orders:decide use the approval link', async () => {
    const workOrder = await quoteRoundOne();
    const { approvalUrl } = (await getWorkOrder(workOrder.number)).budgets[0];

    const approved = await postLink(approvalUrl!, serviceAdvisor.accessToken);

    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'IN_EXECUTION',
      budgets: [{ status: 'APPROVED', decidedByUserId: serviceAdvisor.userId }],
    });
  });

  it('answers the links on the customer routes and on the board', async () => {
    const workOrder = await quoteRoundOne();
    const expected = (await getWorkOrder(workOrder.number)).budgets[0];
    const firstPage = await api(app)
      .get('/api/v1/work-orders')
      .query({ status: 'AWAITING_APPROVAL', page: 1, pageSize: 100 })
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    // The board lists the oldest first, so the work order just quoted closes the last page.
    const lastPage = await api(app)
      .get('/api/v1/work-orders')
      .query({
        status: 'AWAITING_APPROVAL',
        page: Math.ceil((firstPage.body as { totalItems: number }).totalItems / 100),
        pageSize: 100,
      })
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const ownDetail = await api(app)
      .get(`/api/v1/work-orders/me/${workOrder.number}`)
      .set('Authorization', `Bearer ${workOrder.owner.accessToken}`)
      .expect(200);
    const ownList = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${workOrder.owner.accessToken}`)
      .expect(200);

    const links = {
      approvalUrl: approvalUrlOf(workOrder.number, expected.id),
      rejectionUrl: rejectionUrlOf(workOrder.number, expected.id),
    };
    expect((ownDetail.body as WorkOrderView).budgets[0]).toMatchObject(links);
    const listed = (ownList.body as WorkOrderView[]).find((row) => row.id === workOrder.id);
    expect(listed?.budgets[0]).toMatchObject(links);
    const boardItems = (lastPage.body as { items: WorkOrderView[] }).items;
    expect(boardItems[boardItems.length - 1]).toMatchObject({ id: workOrder.id });
    expect(boardItems[boardItems.length - 1].budgets[0]).toMatchObject(links);
  });

  it('answers 400 for a budget id that is not a UUID', async () => {
    const workOrder = await quoteRoundOne();

    const response = await postLink(
      `${PUBLIC_URL}/api/v1/work-orders/${workOrder.number}/budgets/not-an-id/approval`,
      workOrder.owner.accessToken,
    );

    expect(response.status).toBe(400);
    expect((await getWorkOrder(workOrder.number)).status).toBe('AWAITING_APPROVAL');
  });
});
