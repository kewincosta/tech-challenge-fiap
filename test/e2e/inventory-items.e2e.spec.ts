import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueSku } from '../support/factories/sku.factory';
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

async function loginAs(role: string): Promise<AuthenticatedClient> {
  const credentials = await registerUser(app);
  await grantRole(app, credentials.userId, role);
  return login(app, credentials);
}

async function createItem(overrides: { sku?: string; kind?: string } = {}) {
  const sku = overrides.sku ?? uniqueSku();
  const response = await api(app)
    .post('/api/v1/inventory-items')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      sku,
      name: 'Filtro de oleo',
      description: 'Filtro padrao',
      kind: overrides.kind ?? 'PART',
      unitPriceCents: 2500,
    })
    .expect(201);
  return { id: (response.body as { id: string }).id, sku };
}

describe('Inventory items', () => {
  it('should create an item as an administrator', async () => {
    const response = await api(app)
      .post('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ sku: uniqueSku(), name: 'Oleo 5W30', kind: 'SUPPLY', unitPriceCents: 4500 })
      .expect(201);

    expect(response.body).toEqual({ id: expect.any(String) as string });
  });

  it("should update an item's name, description and unit price as an administrator", async () => {
    const item = await createItem();

    const response = await api(app)
      .patch(`/api/v1/inventory-items/${item.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ unitPriceCents: 3000, description: 'Filtro premium' })
      .expect(200);

    // Sku.create() normalises to upper case (T1) - the API echoes the stored, normalised value.
    expect(response.body).toMatchObject({
      sku: item.sku.toUpperCase(),
      unitPriceCents: 3000,
      description: 'Filtro premium',
      quantityOnHand: 0,
    });
  });

  it('should replenish an item, raising the count and recording the acting user', async () => {
    const item = await createItem();

    const response = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 10, unitPriceCents: 2500, note: 'Reposicao mensal' })
      .expect(200);
    expect(response.body).toMatchObject({ quantityOnHand: 10 });

    const history = await api(app)
      .get(`/api/v1/inventory-items/${item.id}/movements`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(history.body).toMatchObject([
      { kind: 'INBOUND', quantity: 10, actorUserId: expect.any(String) as string },
    ]);
  });

  it('should adjust an item down, lowering the count', async () => {
    const item = await createItem();
    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 10, unitPriceCents: 2500 })
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/adjustments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 3, note: 'Contagem divergente' })
      .expect(200);

    expect(response.body).toMatchObject({ quantityOnHand: 7 });
  });

  it('should refuse a mechanic replenishing', async () => {
    const mechanic = await loginAs('MECHANIC');
    const item = await createItem();

    const response = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should let a mechanic list and read the catalog', async () => {
    const mechanic = await loginAs('MECHANIC');
    const item = await createItem();

    const listed = await api(app)
      .get('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    expect((listed.body as Array<{ id: string }>).map((row) => row.id)).toContain(item.id);

    const read = await api(app)
      .get(`/api/v1/inventory-items/${item.id}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(200);
    expect(read.body).toMatchObject({ id: item.id, status: 'ACTIVE' });
  });

  it('should refuse a mechanic reading the movement history', async () => {
    // inventory:read and audit:read are proven distinct: the same mechanic who can list and read
    // the catalog above is refused here.
    const mechanic = await loginAs('MECHANIC');
    const item = await createItem();

    const response = await api(app)
      .get(`/api/v1/inventory-items/${item.id}/movements`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse an adjustment below the count with 422 and leave the count unchanged', async () => {
    const item = await createItem();
    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/adjustments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 6, note: 'nota' })
      .expect(422);
    expect(response.body).toMatchObject({ code: 'INVENTORY_INSUFFICIENT_STOCK' });

    const read = await api(app)
      .get(`/api/v1/inventory-items/${item.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(read.body).toMatchObject({ quantityOnHand: 5 });
  });

  it('should refuse an adjustment with no note with 400', async () => {
    const item = await createItem();
    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(200);

    const response = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/adjustments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 1 })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVENTORY_ADJUSTMENT_NOTE_REQUIRED' });
  });

  it('should return 404 for a movement against an item that does not exist', async () => {
    await api(app)
      .post('/api/v1/inventory-items/00000000-0000-4000-8000-000000000001/replenishments')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(404);

    await api(app)
      .get('/api/v1/inventory-items/00000000-0000-4000-8000-000000000001/movements')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it('should refuse a duplicate active SKU with 409', async () => {
    const item = await createItem();

    const response = await api(app)
      .post('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ sku: item.sku, name: 'Outro filtro', kind: 'PART', unitPriceCents: 3000 })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'INVENTORY_SKU_ALREADY_IN_USE' });
  });

  it('should filter the list by kind', async () => {
    const part = await createItem({ kind: 'PART' });
    const supply = await createItem({ kind: 'SUPPLY' });

    const response = await api(app)
      .get('/api/v1/inventory-items')
      .query({ kind: 'PART' })
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(part.id);
    expect(ids).not.toContain(supply.id);
  });

  it('should refuse a kind outside PART/SUPPLY with 400', async () => {
    const response = await api(app)
      .post('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ sku: uniqueSku(), name: 'Item invalido', kind: 'BOGUS', unitPriceCents: 1000 })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('should refuse a mechanic creating, updating or adjusting an item', async () => {
    // validation.md's Fix 2: replenish's 403 is proven above, but the identical guard on these
    // three sibling routes was not - a sibling route's test does not substitute for its own (L-003).
    const mechanic = await loginAs('MECHANIC');
    const item = await createItem();
    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(200);

    const created = await api(app)
      .post('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ sku: uniqueSku(), name: 'Item', kind: 'PART', unitPriceCents: 1000 })
      .expect(403);
    expect(created.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const updated = await api(app)
      .patch(`/api/v1/inventory-items/${item.id}`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ unitPriceCents: 3000 })
      .expect(403);
    expect(updated.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const adjusted = await api(app)
      .post(`/api/v1/inventory-items/${item.id}/adjustments`)
      .set('Authorization', `Bearer ${mechanic.accessToken}`)
      .send({ quantity: 1, note: 'nota' })
      .expect(403);
    expect(adjusted.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse an actor holding neither inventory permission on the list', async () => {
    const outsider = await registerAndLogin(app);

    const response = await api(app)
      .get('/api/v1/inventory-items')
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should refuse a zero or negative quantity over HTTP on both replenishments and adjustments', async () => {
    const item = await createItem();
    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 5, unitPriceCents: 2500 })
      .expect(200);

    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/replenishments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: 0, unitPriceCents: 2500 })
      .expect(400);

    await api(app)
      .post(`/api/v1/inventory-items/${item.id}/adjustments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ quantity: -1, note: 'nota' })
      .expect(400);
  });
});
