import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { InvalidVehicleDetailsError } from '../errors/invalid-vehicle-details.error';
import { VehicleRegistered } from '../events/vehicle-registered.event';
import { VehicleRemoved } from '../events/vehicle-removed.event';
import { VehicleUpdated } from '../events/vehicle-updated.event';
import { LicensePlate } from '../value-objects/license-plate';
import { VehicleId } from '../value-objects/vehicle-id';
import { VehicleYear } from '../value-objects/vehicle-year';

interface VehicleProps {
  id: VehicleId;
  customerId: string;
  plate: LicensePlate;
  brand: string;
  model: string;
  year: VehicleYear;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface RegisterVehicleInput {
  id: VehicleId;
  customerId: string;
  plate: LicensePlate;
  brand: string;
  model: string;
  year: VehicleYear;
  now: Date;
}

function normaliseText(raw: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    throw new InvalidVehicleDetailsError();
  }
  return value;
}

export class Vehicle extends AggregateRoot {
  private constructor(private readonly props: VehicleProps) {
    super();
  }

  static register(input: RegisterVehicleInput): Vehicle {
    const vehicle = new Vehicle({
      id: input.id,
      customerId: input.customerId,
      plate: input.plate,
      brand: normaliseText(input.brand),
      model: normaliseText(input.model),
      year: input.year,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
    vehicle.record(new VehicleRegistered(input.id.value, input.customerId, input.now));
    return vehicle;
  }

  static restore(props: VehicleProps): Vehicle {
    return new Vehicle({ ...props });
  }

  updateDetails(input: { brand?: string; model?: string; year?: VehicleYear }, now: Date): void {
    if (input.brand !== undefined) {
      this.props.brand = normaliseText(input.brand);
    }
    if (input.model !== undefined) {
      this.props.model = normaliseText(input.model);
    }
    if (input.year !== undefined) {
      this.props.year = input.year;
    }
    this.props.updatedAt = now;
    this.record(new VehicleUpdated(this.props.id.value, now));
  }

  transferTo(customerId: string, now: Date): void {
    this.props.customerId = customerId;
    this.props.updatedAt = now;
    this.record(new VehicleUpdated(this.props.id.value, now));
  }

  remove(now: Date): void {
    if (this.props.deletedAt !== null) {
      return;
    }
    this.props.deletedAt = now;
    this.props.updatedAt = now;
    this.record(new VehicleRemoved(this.props.id.value, now));
  }

  get id(): VehicleId {
    return this.props.id;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get plate(): LicensePlate {
    return this.props.plate;
  }

  get brand(): string {
    return this.props.brand;
  }

  get model(): string {
    return this.props.model;
  }

  get year(): VehicleYear {
    return this.props.year;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
}
