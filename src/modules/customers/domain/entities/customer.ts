import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { CustomerStatus } from '../customer-status';
import { CustomerDeactivated } from '../events/customer-deactivated.event';
import { CustomerRegistered } from '../events/customer-registered.event';
import { CustomerUpdated } from '../events/customer-updated.event';
import { Address } from '../value-objects/address';
import { CustomerId } from '../value-objects/customer-id';
import { PhoneNumber } from '../value-objects/phone-number';

interface CustomerProps {
  id: CustomerId;
  userId: string;
  address: Address | null;
  phoneNumber: PhoneNumber | null;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface RegisterCustomerInput {
  id: CustomerId;
  userId: string;
  address?: Address;
  phoneNumber?: PhoneNumber;
  now: Date;
}

export class Customer extends AggregateRoot {
  private constructor(private readonly props: CustomerProps) {
    super();
  }

  static register(input: RegisterCustomerInput): Customer {
    const customer = new Customer({
      id: input.id,
      userId: input.userId,
      address: input.address ?? null,
      phoneNumber: input.phoneNumber ?? null,
      status: CustomerStatus.Active,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
    customer.record(new CustomerRegistered(input.id.value, input.userId, input.now));
    return customer;
  }

  static restore(props: CustomerProps): Customer {
    return new Customer({ ...props });
  }

  updateProfile(input: { address?: Address; phoneNumber?: PhoneNumber }, now: Date): void {
    if (input.address !== undefined) {
      this.props.address = input.address;
    }
    if (input.phoneNumber !== undefined) {
      this.props.phoneNumber = input.phoneNumber;
    }
    this.props.updatedAt = now;
    this.record(new CustomerUpdated(this.props.id.value, now));
  }

  deactivate(now: Date): void {
    if (this.props.status === CustomerStatus.Inactive) {
      return;
    }
    this.props.status = CustomerStatus.Inactive;
    this.props.deletedAt = now;
    this.props.updatedAt = now;
    this.record(new CustomerDeactivated(this.props.id.value, now));
  }

  get id(): CustomerId {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get address(): Address | null {
    return this.props.address;
  }

  get phoneNumber(): PhoneNumber | null {
    return this.props.phoneNumber;
  }

  get status(): CustomerStatus {
    return this.props.status;
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
