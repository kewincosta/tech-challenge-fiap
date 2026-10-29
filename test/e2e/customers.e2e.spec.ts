import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueValidCpf } from '../support/factories/document.factory';
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

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  close = testApp.close;

  const adminCredentials = await registerUser(app);
  await grantRole(app, adminCredentials.userId, 'ADMIN');
  admin = await login(app, adminCredentials);
});

afterAll(async () => {
  await close();
});

describe('Customers', () => {
  it('should register a customer over an existing user holding CUSTOMER', async () => {
    const target = await registerUser(app);

    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: target.userId })
      .expect(201);

    expect(response.body).toEqual({ id: expect.any(String) as string });
  });

  it('should register a customer through the account-creation branch and return a temporary password', async () => {
    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: `${randomUUID()}@example.com`,
        name: 'Jane Counter',
        document: uniqueValidCpf(),
      })
      .expect(201);

    expect(response.body).toMatchObject({ id: expect.any(String) as string });
    expect((response.body as { temporaryPassword: string }).temporaryPassword).toHaveLength(12);
  });

  it('should refuse registering a customer with a partially populated address', async () => {
    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: `${randomUUID()}@example.com`,
        name: 'Jane Counter',
        document: uniqueValidCpf(),
        address: { street: 'Rua das Flores', number: '123' },
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('should refuse registering a customer without customers:manage', async () => {
    const actor = await registerAndLogin(app);
    const target = await registerUser(app);

    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ userId: target.userId })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should let the authenticated person read and update their own customer record', async () => {
    const person = await registerAndLogin(app);
    await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: person.userId })
      .expect(201);

    const me = await api(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${person.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ userId: person.userId, address: null });

    const updated = await api(app)
      .patch('/api/v1/customers/me')
      .set('Authorization', `Bearer ${person.accessToken}`)
      .send({
        address: {
          street: 'Rua das Flores',
          number: '123',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01001-000',
        },
      })
      .expect(200);
    expect(updated.body).toMatchObject({ address: { city: 'São Paulo', zipCode: '01001000' } });
  });

  it('should list customers filtered by document and get one by id', async () => {
    const target = await registerUser(app);
    const created = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: target.userId })
      .expect(201);
    const customerId = (created.body as { id: string }).id;

    const list = await api(app)
      .get(`/api/v1/customers?document=${target.document}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: customerId })]);

    const found = await api(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(found.body).toMatchObject({ id: customerId, document: target.document });
  });

  it('should let staff update a customer record they do not own', async () => {
    const target = await registerUser(app);
    const created = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: target.userId })
      .expect(201);
    const customerId = (created.body as { id: string }).id;

    const updated = await api(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phoneNumber: '11987654321' })
      .expect(200);

    expect(updated.body).toMatchObject({ phoneNumber: '11987654321' });
  });

  it('should deactivate a customer and exclude it from a later document search', async () => {
    const target = await registerUser(app);
    const created = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: target.userId })
      .expect(201);
    const customerId = (created.body as { id: string }).id;

    await api(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const list = await api(app)
      .get(`/api/v1/customers?document=${target.document}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('should refuse reading a customer without customers:read', async () => {
    const actor = await registerAndLogin(app);
    const target = await registerUser(app);
    const created = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: target.userId })
      .expect(201);
    const customerId = (created.body as { id: string }).id;

    const response = await api(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should return 404 for an unknown customer id', async () => {
    await api(app)
      .get('/api/v1/customers/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it('should answer 404 CUSTOMER_NOT_FOUND for a customer id that does not exist', async () => {
    const response = await api(app)
      .get(`/api/v1/customers/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('should answer 404 CUSTOMER_NOT_FOUND on /customers/me for a user without a customer record', async () => {
    const person = await registerAndLogin(app);

    const response = await api(app)
      .get('/api/v1/customers/me')
      .set('Authorization', `Bearer ${person.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('should return 404 when registering a customer over a user that does not exist', async () => {
    // Every current account-creation path (public sign-up, POST /users/staff) unconditionally
    // assigns CUSTOMER, so there is no HTTP fixture for "a real user missing the CUSTOMER role" -
    // that negative branch is proven at the unit level instead
    // (register-customer.use-case.spec.ts, "should refuse an existing user without the CUSTOMER
    // role"). This test proves the sibling branch this wiring is actually reachable for: a userId
    // that resolves to nobody.
    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: '00000000-0000-4000-8000-000000000002' })
      .expect(404);

    expect(response.body).toMatchObject({ code: 'CUSTOMER_TARGET_USER_NOT_FOUND' });
  });
});

describe('Customers - the list filters', () => {
  interface ListedCustomer {
    id: string;
    userId: string;
    name: string;
    email: string;
    document: string;
    address: null;
    phoneNumber: null;
    status: string;
  }

  // The account-creation branch of POST /customers, the one place a test chooses the name, the
  // e-mail and the document of the user behind the customer.
  async function registerWithAccount(name: string): Promise<{
    id: string;
    name: string;
    email: string;
    document: string;
  }> {
    const email = `${randomUUID()}@example.com`;
    const document = uniqueValidCpf();
    const response = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email, name, document })
      .expect(201);
    return { id: (response.body as { id: string }).id, name, email, document };
  }

  async function userIdOf(document: string): Promise<string> {
    const response = await api(app)
      .get('/api/v1/users')
      .query({ document })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    return (response.body as Array<{ id: string }>)[0].id;
  }

  async function listCustomers(filter: { name?: string; document?: string }): Promise<unknown> {
    const response = await api(app)
      .get('/api/v1/customers')
      .query(filter)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    return response.body;
  }

  // Letters only, so that upper-casing it always changes it.
  function uniqueLetters(): string {
    return randomUUID()
      .replace(/-/g, '')
      .replace(/[0-9]/g, (digit) => 'ghijklmnop'[Number(digit)]);
  }

  it('should return only the active customer holding a well-formed document, with the name, e-mail and document of its user', async () => {
    const wanted = await registerWithAccount('Maria Documento');
    await registerWithAccount('Pedro Outro Documento');
    const userId = await userIdOf(wanted.document);
    const expected: ListedCustomer = {
      id: wanted.id,
      userId,
      name: 'Maria Documento',
      email: wanted.email,
      document: wanted.document,
      address: null,
      phoneNumber: null,
      status: 'ACTIVE',
    };
    const masked = `${wanted.document.slice(0, 3)}.${wanted.document.slice(3, 6)}.${wanted.document.slice(6, 9)}-${wanted.document.slice(9)}`;

    expect(await listCustomers({ document: wanted.document })).toEqual([expected]);
    expect(await listCustomers({ document: masked })).toEqual([expected]);
  });

  it('should answer 200 with an empty list for a malformed document', async () => {
    await registerWithAccount('Ana Qualquer');

    expect(await listCustomers({ document: '123' })).toEqual([]);
    expect(await listCustomers({ document: '11111111111' })).toEqual([]);
  });

  it('should return the active customers whose name contains the filter in any letter case, newest first', async () => {
    const token = uniqueLetters();
    const older = await registerWithAccount(`Zelia ${token} Lima`);
    const newer = await registerWithAccount(`Bruno ${token}`);
    const deactivated = await registerWithAccount(`Carla ${token}`);
    await registerWithAccount('Diego Sem Filtro');
    await api(app)
      .delete(`/api/v1/customers/${deactivated.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    const body = await listCustomers({ name: token.slice(2, 10).toUpperCase() });

    expect(body).toEqual([
      expect.objectContaining({ id: newer.id, name: `Bruno ${token}`, email: newer.email }),
      expect.objectContaining({ id: older.id, name: `Zelia ${token} Lima`, email: older.email }),
    ]);
  });
});
