import { describe, expect, it } from 'vitest';
import { InvalidVehicleDetailsError } from '../errors/invalid-vehicle-details.error';
import { VehicleRegistered } from '../events/vehicle-registered.event';
import { VehicleRemoved } from '../events/vehicle-removed.event';
import { VehicleUpdated } from '../events/vehicle-updated.event';
import { LicensePlate } from '../value-objects/license-plate';
import { VehicleId } from '../value-objects/vehicle-id';
import { VehicleYear } from '../value-objects/vehicle-year';
import { Vehicle } from './vehicle';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const VEHICLE_ID = VehicleId.create('11111111-1111-4111-8111-111111111111');
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const PLATE = LicensePlate.create('ABC1234');
const YEAR = VehicleYear.create(2020, 2026);

function register(overrides: { brand?: string; model?: string } = {}) {
  return Vehicle.register({
    id: VEHICLE_ID,
    customerId: CUSTOMER_ID,
    plate: PLATE,
    brand: overrides.brand ?? 'Toyota',
    model: overrides.model ?? 'Corolla',
    year: YEAR,
    now: NOW,
  });
}

describe('Vehicle', () => {
  it('should register a vehicle and record VehicleRegistered', () => {
    const vehicle = register();

    expect(vehicle.pullDomainEvents()).toEqual([
      new VehicleRegistered(VEHICLE_ID.value, CUSTOMER_ID, NOW),
    ]);
    expect(vehicle.plate).toBe(PLATE);
  });

  it('should trim brand and model', () => {
    const vehicle = register({ brand: '  Toyota  ', model: '  Corolla  ' });

    expect(vehicle.brand).toBe('Toyota');
    expect(vehicle.model).toBe('Corolla');
  });

  it('should reject an empty brand', () => {
    expect(() => register({ brand: '   ' })).toThrow(InvalidVehicleDetailsError);
  });

  it('should restore from persisted props with no domain event', () => {
    const vehicle = Vehicle.restore({
      id: VEHICLE_ID,
      customerId: CUSTOMER_ID,
      plate: PLATE,
      brand: 'Toyota',
      model: 'Corolla',
      year: YEAR,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });

    expect(vehicle.pullDomainEvents()).toEqual([]);
  });

  it('should update the brand only, leaving model and year untouched', () => {
    const vehicle = register();
    vehicle.pullDomainEvents();

    vehicle.updateDetails({ brand: 'Honda' }, NOW);

    expect(vehicle.brand).toBe('Honda');
    expect(vehicle.model).toBe('Corolla');
    expect(vehicle.year).toBe(YEAR);
    expect(vehicle.pullDomainEvents()).toEqual([new VehicleUpdated(VEHICLE_ID.value, NOW)]);
  });

  it('should transfer ownership to a new customer', () => {
    const vehicle = register();
    vehicle.pullDomainEvents();

    vehicle.transferTo(OTHER_CUSTOMER_ID, NOW);

    expect(vehicle.customerId).toBe(OTHER_CUSTOMER_ID);
    expect(vehicle.pullDomainEvents()).toEqual([new VehicleUpdated(VEHICLE_ID.value, NOW)]);
  });

  it('should remove a vehicle and record VehicleRemoved', () => {
    const vehicle = register();
    vehicle.pullDomainEvents();

    vehicle.remove(NOW);

    expect(vehicle.deletedAt).toBe(NOW);
    expect(vehicle.pullDomainEvents()).toEqual([new VehicleRemoved(VEHICLE_ID.value, NOW)]);
  });

  it('should be idempotent when removed twice', () => {
    const vehicle = register();
    vehicle.remove(NOW);
    vehicle.pullDomainEvents();

    vehicle.remove(NOW);

    expect(vehicle.pullDomainEvents()).toEqual([]);
  });
});
