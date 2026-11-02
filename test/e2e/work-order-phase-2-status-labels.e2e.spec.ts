import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
import { uniqueServiceName } from '../support/factories/service.factory';
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

interface LabeledWorkOrder {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
}

interface OpenedWorkOrder {
  number: string;
  id: string;
  owner: AuthenticatedClient;
}

/** Opens a work order for a customer who can log in, and logs the customer in. */
async function openWorkOrderOfACustomer(): Promise<OpenedWorkOrder> {
  const credentials: RegisteredCredentials = await registerUser(app);
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
  const opened = await api(app)
    .post('/api/v1/work-orders')
    .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
    .send({ customerId, vehicleId: (vehicle.body as { id: string }).id })
    .expect(201);
  const created = opened.body as { id: string; number: string };
  return { number: created.number, id: created.id, owner };
}

describe('Status labels', () => {
  it('answers statusLabel on the detail, the customer routes and the board', async () => {
    const { number, id, owner } = await openWorkOrderOfACustomer();

    const detail = await api(app)
      .get(`/api/v1/work-orders/${number}`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const ownDetail = await api(app)
      .get(`/api/v1/work-orders/me/${number}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const ownList = await api(app)
      .get('/api/v1/work-orders/me')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    // The board lists the oldest first, so the work order just opened closes the last page of
    // RECEIVED.
    const firstPage = await api(app)
      .get('/api/v1/work-orders')
      .query({ status: 'RECEIVED', page: 1, pageSize: 100 })
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);
    const lastPage = await api(app)
      .get('/api/v1/work-orders')
      .query({
        status: 'RECEIVED',
        page: Math.ceil((firstPage.body as { totalItems: number }).totalItems / 100),
        pageSize: 100,
      })
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .expect(200);

    const expected = { status: 'RECEIVED', statusLabel: 'Recebida' };
    expect(detail.body).toMatchObject({ id, ...expected });
    expect(ownDetail.body).toMatchObject({ id, ...expected });
    const ownListed = (ownList.body as LabeledWorkOrder[]).find((row) => row.id === id);
    expect(ownListed).toMatchObject(expected);
    const boardItems = (lastPage.body as { items: LabeledWorkOrder[] }).items;
    expect(boardItems[boardItems.length - 1]).toMatchObject({ id, ...expected });
  });

  it('names each status in Portuguese along the whole flow and on a cancellation', async () => {
    const { number, id } = await openWorkOrderOfACustomer();
    const service = await api(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: uniqueServiceName(), priceCents: 15099, estimatedDurationMinutes: 60 })
      .expect(201);
    await api(app)
      .post(`/api/v1/work-orders/${number}/services`)
      .set('Authorization', `Bearer ${serviceAdvisor.accessToken}`)
      .send({ serviceId: (service.body as { id: string }).id })
      .expect(200);
    const steps: Array<{ path: string; token: string; status: string; label: string }> = [
      {
        path: 'diagnosis',
        token: mechanic.accessToken,
        status: 'IN_DIAGNOSIS',
        label: 'Diagnóstico',
      },
      {
        path: 'diagnosis/completion',
        token: mechanic.accessToken,
        status: 'AWAITING_APPROVAL',
        label: 'Aguardando Aprovação',
      },
      {
        path: 'budget/approval',
        token: serviceAdvisor.accessToken,
        status: 'IN_EXECUTION',
        label: 'Execução',
      },
      {
        path: 'completion',
        token: mechanic.accessToken,
        status: 'COMPLETED',
        label: 'Finalizada',
      },
      {
        path: 'delivery',
        token: serviceAdvisor.accessToken,
        status: 'DELIVERED',
        label: 'Entregue',
      },
    ];

    for (const step of steps) {
      const response = await api(app)
        .post(`/api/v1/work-orders/${number}/${step.path}`)
        .set('Authorization', `Bearer ${step.token}`)
        .expect(200);
      expect(response.body, step.path).toMatchObject({
        id,
        status: step.status,
        statusLabel: step.label,
      });
    }

    const canceled = await openWorkOrderOfACustomer();
    const cancellation = await api(app)
      .post(`/api/v1/work-orders/${canceled.number}/cancellation`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Customer decided to postpone the service' })
      .expect(200);
    expect(cancellation.body).toMatchObject({ status: 'CANCELED', statusLabel: 'Cancelada' });
  });
});
