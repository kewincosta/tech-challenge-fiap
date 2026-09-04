import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/app';
import { uniqueLicensePlate } from '../support/factories/plate.factory';
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

async function registerCustomer(): Promise<{ customerId: string; userId: string }> {
  const target = await registerUser(app);
  const response = await api(app)
    .post('/api/v1/customers')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: target.userId })
    .expect(201);
  return { customerId: (response.body as { id: string }).id, userId: target.userId };
}

describe('Vehicles', () => {
  it('should register a vehicle for an active customer', async () => {
    const { customerId } = await registerCustomer();

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

    expect(response.body).toEqual({ id: expect.any(String) as string });
  });

  it('should refuse registering a vehicle for a deactivated customer', async () => {
    const { customerId } = await registerCustomer();
    await api(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

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
      .expect(422);

    expect(response.body).toMatchObject({ code: 'VEHICLE_OWNING_CUSTOMER_INACTIVE' });
  });

  it('should refuse registering a vehicle without vehicles:manage', async () => {
    const actor = await registerAndLogin(app);
    const { customerId } = await registerCustomer();

    const response = await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({
        customerId,
        plate: uniqueLicensePlate(),
        brand: 'Toyota',
        model: 'Corolla',
        year: 2020,
      })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('should let the authenticated person list their own vehicles', async () => {
    const person = await registerAndLogin(app);
    const created = await api(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: person.userId })
      .expect(201);
    const customerId = (created.body as { id: string }).id;
    const plate = uniqueLicensePlate();
    await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId, plate, brand: 'Toyota', model: 'Corolla', year: 2020 })
      .expect(201);

    const response = await api(app)
      .get('/api/v1/vehicles/me')
      .set('Authorization', `Bearer ${person.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({ plate })]);
  });

  it('should return an empty list from /vehicles/me for a user with no customer record', async () => {
    const actor = await registerAndLogin(app);

    const response = await api(app)
      .get('/api/v1/vehicles/me')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('should list a customer vehicles filtered by customerId', async () => {
    const { customerId } = await registerCustomer();
    const plate = uniqueLicensePlate();
    await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId, plate, brand: 'Toyota', model: 'Corolla', year: 2020 })
      .expect(201);

    const response = await api(app)
      .get(`/api/v1/vehicles?customerId=${customerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({ plate, customerId })]);
  });

  it('should get a vehicle by id', async () => {
    const { customerId } = await registerCustomer();
    const plate = uniqueLicensePlate();
    const created = await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId, plate, brand: 'Toyota', model: 'Corolla', year: 2020 })
      .expect(201);
    const vehicleId = (created.body as { id: string }).id;

    const response = await api(app)
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: vehicleId, plate });
  });

  it('should update a vehicle details', async () => {
    const { customerId } = await registerCustomer();
    const created = await api(app)
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
    const vehicleId = (created.body as { id: string }).id;

    const response = await api(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ brand: 'Honda', model: 'Civic' })
      .expect(200);

    expect(response.body).toMatchObject({ brand: 'Honda', model: 'Civic' });
  });

  it('should transfer a vehicle to another customer', async () => {
    const { customerId } = await registerCustomer();
    const { customerId: newCustomerId } = await registerCustomer();
    const created = await api(app)
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
    const vehicleId = (created.body as { id: string }).id;

    const response = await api(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId: newCustomerId })
      .expect(200);

    expect(response.body).toMatchObject({ customerId: newCustomerId });
  });

  it('should return 404 when registering a vehicle for a customer that does not exist', async () => {
    const response = await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        customerId: '00000000-0000-4000-8000-000000000001',
        plate: uniqueLicensePlate(),
        brand: 'Toyota',
        model: 'Corolla',
        year: 2020,
      })
      .expect(404);

    expect(response.body).toMatchObject({ code: 'VEHICLE_REFERENCED_CUSTOMER_NOT_FOUND' });
  });

  it('should refuse transferring a vehicle to a deactivated customer', async () => {
    const { customerId } = await registerCustomer();
    const { customerId: deactivatedCustomerId } = await registerCustomer();
    await api(app)
      .delete(`/api/v1/customers/${deactivatedCustomerId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);
    const created = await api(app)
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
    const vehicleId = (created.body as { id: string }).id;

    const response = await api(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId: deactivatedCustomerId })
      .expect(422);

    expect(response.body).toMatchObject({ code: 'VEHICLE_OWNING_CUSTOMER_INACTIVE' });
  });

  it('should return 404 when transferring a vehicle to a customer that does not exist', async () => {
    const { customerId } = await registerCustomer();
    const created = await api(app)
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
    const vehicleId = (created.body as { id: string }).id;

    const response = await api(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId: '00000000-0000-4000-8000-000000000002' })
      .expect(404);

    expect(response.body).toMatchObject({ code: 'VEHICLE_REFERENCED_CUSTOMER_NOT_FOUND' });
  });

  it('should remove a vehicle and answer 404 for it afterwards', async () => {
    const { customerId } = await registerCustomer();
    const created = await api(app)
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
    const vehicleId = (created.body as { id: string }).id;

    await api(app)
      .delete(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    await api(app)
      .get(`/api/v1/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it('should refuse a duplicate active plate', async () => {
    const { customerId } = await registerCustomer();
    const plate = uniqueLicensePlate();
    await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId, plate, brand: 'Toyota', model: 'Corolla', year: 2020 })
      .expect(201);

    const response = await api(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ customerId, plate, brand: 'Honda', model: 'Civic', year: 2021 })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'VEHICLE_LICENSE_PLATE_ALREADY_IN_USE' });
  });
});
