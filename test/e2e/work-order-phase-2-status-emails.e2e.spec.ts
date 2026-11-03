import { INestApplication, Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../support/app';
import { FailingMailer, RecordingMailer } from '../support/fakes/recording-mailer';
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
  approvalUrl: string | null;
  rejectionUrl: string | null;
}

interface WorkOrderView {
  number: string;
  status: string;
  budgets: BudgetView[];
}

interface Customer {
  customerId: string;
  vehicleId: string;
  /** Where the customer's e-mails go: the address of their account. */
  email: string;
  owner: AuthenticatedClient;
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

/** A customer who can sign in, with a vehicle of their own. */
async function registerCustomer(): Promise<Customer> {
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
    email: credentials.email,
    owner,
  };
}

/** Opens a work order for the customer with a service of 150.99 and a part of 2 x 25.00. */
async function open(customer: Customer): Promise<string> {
  const opened = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({
      customerId: customer.customerId,
      vehicleId: customer.vehicleId,
      services: [{ serviceId: await createCatalogService(15099) }],
      parts: [{ inventoryItemId: await createInventoryItem(2500), quantity: 2 }],
    })
    .expect(201);
  return (opened.body as { number: string }).number;
}

async function post(number: string, path: string, client: AuthenticatedClient, expected = 200) {
  return api(app)
    .post(`/api/v1/work-orders/${number}/${path}`)
    .set('Authorization', `Bearer ${client.accessToken}`)
    .expect(expected);
}

async function getWorkOrder(number: string): Promise<WorkOrderView> {
  const response = await api(app)
    .get(`/api/v1/work-orders/${number}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return response.body as WorkOrderView;
}

/** Lets a subscriber that should not have sent anything show that it did. */
function pause(milliseconds = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('Status e-mails', () => {
  it('sends one e-mail per change along the whole flow', async () => {
    const customer = await registerCustomer();
    const number = await open(customer);
    await mailer.waitForMailTo(customer.email, 1);

    await post(number, 'diagnosis', mechanic);
    await mailer.waitForMailTo(customer.email, 2);
    await post(number, 'diagnosis/completion', mechanic);
    await mailer.waitForMailTo(customer.email, 3);
    await post(number, 'budget/approval', customer.owner);
    await mailer.waitForMailTo(customer.email, 4);
    await post(number, 'completion', mechanic);
    await mailer.waitForMailTo(customer.email, 5);
    await post(number, 'delivery', serviceAdvisor);
    await mailer.waitForMailTo(customer.email, 6);
    // The approval records BudgetApproved and ExecutionStarted, and still sent one e-mail.
    await pause();

    const sent = mailer.sentTo(customer.email);
    expect(sent.map((message) => message.subject)).toEqual([
      `Ordem de serviço ${number}: Recebida`,
      `Ordem de serviço ${number}: Diagnóstico`,
      `Ordem de serviço ${number}: Aguardando Aprovação`,
      `Ordem de serviço ${number}: Execução`,
      `Ordem de serviço ${number}: Finalizada`,
      `Ordem de serviço ${number}: Entregue`,
    ]);
    expect(sent.every((message) => message.text.includes(number))).toBe(true);
    expect(sent[0].text).toContain('Olá,');
  });

  it('sends one e-mail for a rejection, a supplementary round and a cancellation', async () => {
    const rejecting = await registerCustomer();
    const rejectedNumber = await open(rejecting);
    await post(rejectedNumber, 'diagnosis', mechanic);
    await post(rejectedNumber, 'diagnosis/completion', mechanic);
    await mailer.waitForMailTo(rejecting.email, 3);

    await post(rejectedNumber, 'budget/rejection', rejecting.owner);

    const rejectionMails = await mailer.waitForMailTo(rejecting.email, 4);
    expect(rejectionMails[3].subject).toBe(`Ordem de serviço ${rejectedNumber}: Diagnóstico`);
    // The opening, the diagnosis, the quote and the rejection: a second e-mail for the rejection
    // would arrive after the first.
    await pause();
    expect(mailer.sentTo(rejecting.email)).toHaveLength(4);

    const supplementing = await registerCustomer();
    const supplementedNumber = await open(supplementing);
    await post(supplementedNumber, 'diagnosis', mechanic);
    await post(supplementedNumber, 'diagnosis/completion', mechanic);
    await post(supplementedNumber, 'budget/approval', supplementing.owner);
    await mailer.waitForMailTo(supplementing.email, 4);
    await api(app)
      .post(`/api/v1/work-orders/${supplementedNumber}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId: await createCatalogService(5000) })
      .expect(200);

    await post(supplementedNumber, 'budget/supplementary', mechanic);

    const supplementaryMails = await mailer.waitForMailTo(supplementing.email, 5);
    const supplementary = supplementaryMails[4];
    expect(supplementary.subject).toBe(
      `Ordem de serviço ${supplementedNumber}: Aguardando Aprovação`,
    );
    const roundTwo = (await getWorkOrder(supplementedNumber)).budgets[1];
    const roundOne = (await getWorkOrder(supplementedNumber)).budgets[0];
    for (const body of [supplementary.text, supplementary.html]) {
      expect(body).toContain(roundTwo.approvalUrl!);
      expect(body).toContain(roundTwo.rejectionUrl!);
      expect(body).toContain(roundTwo.id);
      expect(body).not.toContain(roundOne.id);
    }
    expect(supplementary.text).toContain('R$ 50,00');

    await api(app)
      .post(`/api/v1/work-orders/${supplementedNumber}/cancellation`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Customer decided to postpone the service' })
      .expect(200);

    const cancellationMails = await mailer.waitForMailTo(supplementing.email, 6);
    expect(cancellationMails[5].subject).toBe(`Ordem de serviço ${supplementedNumber}: Cancelada`);
    // The opening, the diagnosis, the quote, the approval, the supplementary round and the
    // cancellation: a second e-mail for the cancellation would arrive after the first.
    await pause();
    expect(mailer.sentTo(supplementing.email)).toHaveLength(6);
  });

  it("puts the API's decision links in the budget e-mail", async () => {
    const customer = await registerCustomer();
    const number = await open(customer);
    await post(number, 'diagnosis', mechanic);

    await post(number, 'diagnosis/completion', mechanic);

    const [budget] = (await getWorkOrder(number)).budgets;
    const [, , quoted] = await mailer.waitForMailTo(customer.email, 3);
    expect(quoted.subject).toBe(`Ordem de serviço ${number}: Aguardando Aprovação`);
    for (const body of [quoted.text, quoted.html]) {
      expect(body).toContain(budget.approvalUrl!);
      expect(body).toContain(budget.rejectionUrl!);
      // 150.99 of the service and 2 x 25.00 of the part.
      expect(body).toContain('R$ 200,99');
    }
    // What the e-mail names is what decides the budget: the address with its query, called with POST.
    const { pathname, search } = new URL(budget.approvalUrl!);
    const approved = await api(app)
      .post(`${pathname}${search}`)
      .set('Authorization', `Bearer ${customer.owner.accessToken}`);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'IN_EXECUTION' });
  });

  it('keeps the transition when the e-mail fails', async () => {
    const customer = await registerCustomer();
    const number = await open(customer);
    const failure = new Error('The mail server refused the message.');
    const failingMailer = new FailingMailer(failure);
    const failing = await createTestApp({ mailer: failingMailer });
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await api(failing.app)
        .post(`/api/v1/work-orders/${number}/diagnosis`)
        .set('Authorization', `Bearer ${mechanic.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ number, status: 'IN_DIAGNOSIS' });
      await failingMailer.waitForAttempts(1);
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining(`work order ${number} was not sent: ${failure.message}`),
        failure.stack,
      );
      expect((await getWorkOrder(number)).status).toBe('IN_DIAGNOSIS');
    } finally {
      errorLog.mockRestore();
      await failing.close();
    }
  });

  it('sends nothing when no status changes', async () => {
    const customer = await registerCustomer();
    const number = await open(customer);
    await post(number, 'diagnosis', mechanic);
    await mailer.waitForMailTo(customer.email, 2);

    // A transition the status refuses, and two edits of the items.
    const refused = await post(number, 'diagnosis', mechanic, 422);
    expect(refused.body).toMatchObject({ code: 'WORK_ORDER_INVALID_STATE' });
    await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId: await createCatalogService(5000) })
      .expect(200);
    await api(app)
      .post(`/api/v1/work-orders/${number}/parts`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ inventoryItemId: await createInventoryItem(1000), quantity: 1 })
      .expect(200);
    // A change that does send, after them: whatever the three above sent would be queued before it.
    await post(number, 'diagnosis/completion', mechanic);
    await mailer.waitForMailTo(customer.email, 3);
    await pause();

    expect(mailer.sentTo(customer.email).map((message) => message.subject)).toEqual([
      `Ordem de serviço ${number}: Recebida`,
      `Ordem de serviço ${number}: Diagnóstico`,
      `Ordem de serviço ${number}: Aguardando Aprovação`,
    ]);
  });
});
