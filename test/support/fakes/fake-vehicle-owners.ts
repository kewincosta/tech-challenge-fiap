import {
  OwnerRef,
  VehicleOwners,
} from '../../../src/modules/vehicles/application/ports/vehicle-owners.port';

export class FakeVehicleOwners implements VehicleOwners {
  private readonly owners = new Map<string, OwnerRef>();
  private readonly ownerIdsByUserId = new Map<string, string>();
  /** Every user id whose customer was asked for, in order. */
  readonly userLookups: string[] = [];

  /** Seeds a customer; give the user account it belongs to for `findByUserId` to find it. */
  add(owner: OwnerRef, userId?: string): this {
    this.owners.set(owner.id, owner);
    if (userId !== undefined) {
      this.ownerIdsByUserId.set(userId, owner.id);
    }
    return this;
  }

  async findById(customerId: string): Promise<OwnerRef | null> {
    return Promise.resolve(this.owners.get(customerId) ?? null);
  }

  async findByUserId(userId: string): Promise<{ id: string } | null> {
    this.userLookups.push(userId);
    const ownerId = this.ownerIdsByUserId.get(userId);
    return Promise.resolve(ownerId === undefined ? null : { id: ownerId });
  }
}
