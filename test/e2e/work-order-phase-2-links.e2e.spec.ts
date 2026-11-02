import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import type { RecordingMailer } from '../support/fakes/recording-mailer';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueServiceName } from '../support/factories/service.factory';
import { uniqueSku } from '../support/factories/sku.factory';
import { api, grantRole, login, registerUser, type AuthenticatedClient } from '../support/http';

let app: INestApplication;
let mailer: RecordingMailer;
let close: () => Promise<void>;
let admin: AuthenticatedClient;
let serviceAdvisor: AuthenticatedClient;
let mechanic: AuthenticatedClient;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  mailer = testApp.mailer;
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
  generatedAt: string;
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
  /** Where the customer's e-mails go: the address of their account. */
  email: string;
}

const PUBLIC_URL = process.env.APP_PUBLIC_URL;

type Generation = Pick<BudgetView, 'id' | 'generatedAt'>;

/**
 * What the plan says the links carry: the first 32 hexadecimal characters of the SHA-256 of
 * "<budget id>:<the moment the round was generated, in epoch milliseconds>".
 */
function linkHashOf(budget: Generation): string {
  return createHash('sha256')
    .update(`${budget.id}:${new Date(budget.generatedAt).getTime()}`)
    .digest('hex')
    .slice(0, 32);
}

function approvalUrlOf(number: string, budget: Generation): string {
  return `${PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budget.id}/approval?link=${linkHashOf(budget)}`;
}

function rejectionUrlOf(number: string, budget: Generation): string {
  return `${PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budget.id}/rejection?link=${linkHashOf(budget)}`;
}

/** The address an e-mail names for a decision: the one that ends in `/approval` or `/rejection` and its hash. */
function addressInMail(text: string, decision: 'approval' | 'rejection'): string {
  const match = new RegExp(`https?://\\S+/${decision}\\?link=[0-9a-f]{32}`).exec(text);
  if (match === null) {
    throw new Error(`The e-mail names no ${decision} address with a link hash:\n${text}`);
  }
  return match[0];
}

/** The link as the e-mail and the answer carry it, called the way a client would: path and query, POST. */
async function postLink(url: string, token?: string): Promise<Response> {
  const { pathname, search } = new URL(url);
  const request = api(app).post(`${pathname}${search}`);
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
  email: string;
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
  return {
    customerId,
    vehicleId: (vehicle.body as { id: string }).id,
    owner,
    email: credentials.email,
  };
}

/** Opens a work order with a service and a part, and takes it to AWAITING_APPROVAL on round 1. */
async function quoteRoundOne(): Promise<QuotedWorkOrder> {
  const { customerId, vehicleId, owner, email } = await registerCustomerWithVehicle();
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
  return { number, id, owner, customerId, email };
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
    expect(round1.approvalUrl).toBe(approvalUrlOf(workOrder.number, round1));
    expect(round1.rejectionUrl).toBe(rejectionUrlOf(workOrder.number, round1));
    expect(linkHashOf(round1)).toMatch(/^[0-9a-f]{32}$/);
    expect(new URL(round1.approvalUrl!).pathname).toMatch(/\/budgets\/[^/]+\/approval$/);
    expect(new URL(round1.rejectionUrl!).pathname).toMatch(/\/budgets\/[^/]+\/rejection$/);
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
    expect(round2.approvalUrl).toBe(approvalUrlOf(workOrder.number, round2));
    expect(round2.rejectionUrl).toBe(rejectionUrlOf(workOrder.number, round2));
  });

  it('answers null links on the pending budget of a canceled work order', async () => {
    const workOrder = await quoteRoundOne();
    const [awaiting] = (await getWorkOrder(workOrder.number)).budgets;
    expect(awaiting.status).toBe('PENDING');
    expect(awaiting.approvalUrl).toBe(approvalUrlOf(workOrder.number, awaiting));
    expect(awaiting.rejectionUrl).toBe(rejectionUrlOf(workOrder.number, awaiting));

    const cancellation = await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/cancellation`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Customer decided to postpone the service' })
      .expect(200);

    // The cancellation leaves the budget pending, and a link on it could only be refused.
    const expected = { id: awaiting.id, status: 'PENDING', approvalUrl: null, rejectionUrl: null };
    expect(cancellation.body).toMatchObject({ status: 'CANCELED', budgets: [expected] });
    const detail = await getWorkOrder(workOrder.number);
    expect(detail.status).toBe('CANCELED');
    expect(detail.budgets).toHaveLength(1);
    expect(detail.budgets[0]).toMatchObject(expected);
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
    expect(detail.budgets[1].approvalUrl).toBe(approvalUrlOf(workOrder.number, detail.budgets[1]));
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
      approvalUrlOf(first.number, budgetOfSecond),
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
      rejectionUrlOf(first.number, budgetOfSecond),
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
      approvalUrlOf(workOrder.number, { id: randomUUID(), generatedAt: new Date().toISOString() }),
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

  it('lets a holder of work-orders:decide use the rejection link', async () => {
    const workOrder = await quoteRoundOne();
    const { rejectionUrl } = (await getWorkOrder(workOrder.number)).budgets[0];

    const rejected = await postLink(rejectionUrl!, serviceAdvisor.accessToken);

    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({
      status: 'IN_DIAGNOSIS',
      budgets: [{ status: 'REJECTED', decidedByUserId: serviceAdvisor.userId }],
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
      approvalUrl: approvalUrlOf(workOrder.number, expected),
      rejectionUrl: rejectionUrlOf(workOrder.number, expected),
    };
    expect((ownDetail.body as WorkOrderView).budgets[0]).toMatchObject(links);
    const listed = (ownList.body as WorkOrderView[]).find((row) => row.id === workOrder.id);
    expect(listed?.budgets[0]).toMatchObject(links);
    const boardItems = (lastPage.body as { items: WorkOrderView[] }).items;
    expect(boardItems[boardItems.length - 1]).toMatchObject({ id: workOrder.id });
    expect(boardItems[boardItems.length - 1].budgets[0]).toMatchObject(links);
  });

  it('refuses a link from before round 1 was generated again and accepts the new one', async () => {
    const workOrder = await quoteRoundOne();
    // The customer holds the e-mails: the third one quotes round 1 for the first time.
    const [, , firstQuote] = await mailer.waitForMailTo(workOrder.email, 3);
    const oldApprovalUrl = addressInMail(firstQuote.text, 'approval');
    const oldRejectionUrl = addressInMail(firstQuote.text, 'rejection');
    const quoted = (await getWorkOrder(workOrder.number)).budgets[0];
    expect(oldApprovalUrl).toBe(quoted.approvalUrl);

    // The customer rejects round 1, the workshop adds a service of 500.00 and completes the
    // diagnosis again: round 1 comes back pending under the same id, at a new total.
    const rejected = await postLink(oldRejectionUrl, workOrder.owner.accessToken);
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'IN_DIAGNOSIS' });
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId: await createCatalogService(50000) })
      .expect(200);
    await api(app)
      .post(`/api/v1/work-orders/${workOrder.number}/diagnosis/completion`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    const requoted = (await getWorkOrder(workOrder.number)).budgets[0];
    // 150.99 and 2 x 25.00 as before, plus 500.00.
    expect(requoted).toMatchObject({ id: quoted.id, status: 'PENDING', totalCents: 70099 });
    const mails = await mailer.waitForMailTo(workOrder.email, 5);
    const newApprovalUrl = addressInMail(mails[4].text, 'approval');
    expect(newApprovalUrl).toBe(requoted.approvalUrl);
    expect(newApprovalUrl).not.toBe(oldApprovalUrl);

    const oldApproval = await postLink(oldApprovalUrl, workOrder.owner.accessToken);
    const oldRejection = await postLink(oldRejectionUrl, workOrder.owner.accessToken);

    for (const refused of [oldApproval, oldRejection]) {
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'WORK_ORDER_BUDGET_LINK_OUTDATED' });
    }
    const awaiting = await getWorkOrder(workOrder.number);
    expect(awaiting.status).toBe('AWAITING_APPROVAL');
    expect(awaiting.budgets).toHaveLength(1);
    expect(awaiting.budgets[0]).toMatchObject({ status: 'PENDING', totalCents: 70099 });

    const approved = await postLink(newApprovalUrl, workOrder.owner.accessToken);

    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'IN_EXECUTION',
      budgets: [{ id: quoted.id, status: 'APPROVED', totalCents: 70099 }],
    });
  });

  it('refuses a tampered or missing link hash on both links', async () => {
    const workOrder = await quoteRoundOne();
    const budget = (await getWorkOrder(workOrder.number)).budgets[0];
    const hash = linkHashOf(budget);
    const firstCharacterChanged = `${hash.startsWith('0') ? '1' : '0'}${hash.slice(1)}`;
    const lastCharacterChanged = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;

    for (const decision of ['approval', 'rejection']) {
      const address = `${PUBLIC_URL}/api/v1/work-orders/${workOrder.number}/budgets/${budget.id}/${decision}`;

      for (const tampered of [firstCharacterChanged, lastCharacterChanged]) {
        const refused = await postLink(`${address}?link=${tampered}`, workOrder.owner.accessToken);

        expect(refused.status, `${decision} with ${tampered}`).toBe(422);
        expect(refused.body, `${decision} with ${tampered}`).toMatchObject({
          code: 'WORK_ORDER_BUDGET_LINK_OUTDATED',
        });
      }
      for (const missing of [address, `${address}?link=`]) {
        const refused = await postLink(missing, workOrder.owner.accessToken);

        expect(refused.status, `${decision} at ${missing}`).toBe(400);
        expect(refused.body, `${decision} at ${missing}`).toMatchObject({
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const detail = await getWorkOrder(workOrder.number);
    expect(detail.status).toBe('AWAITING_APPROVAL');
    expect(detail.budgets).toHaveLength(1);
    expect(detail.budgets[0]).toMatchObject({
      status: 'PENDING',
      approvalUrl: budget.approvalUrl,
      rejectionUrl: budget.rejectionUrl,
    });
    // The refusals consumed nothing: the genuine link still decides the budget.
    const approved = await postLink(budget.approvalUrl!, workOrder.owner.accessToken);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'IN_EXECUTION' });
  });

  it('answers 400 BAD_REQUEST for a budget id that is not a UUID on both links', async () => {
    const workOrder = await quoteRoundOne();

    for (const decision of ['approval', 'rejection']) {
      // The address carries a link, so only the budget id is wrong.
      const response = await postLink(
        `${PUBLIC_URL}/api/v1/work-orders/${workOrder.number}/budgets/not-an-id/${decision}?link=${'0'.repeat(32)}`,
        workOrder.owner.accessToken,
      );

      expect(response.status, decision).toBe(400);
      expect(response.body, decision).toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect((await getWorkOrder(workOrder.number)).status).toBe('AWAITING_APPROVAL');
  });
});
