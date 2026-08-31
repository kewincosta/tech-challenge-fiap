import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { Money } from '../../../../shared/domain/value-objects/money';
import { ServiceStatus } from '../service-status';
import { ServiceCreated } from '../events/service-created.event';
import { ServiceDeactivated } from '../events/service-deactivated.event';
import { ServiceUpdated } from '../events/service-updated.event';
import { ServiceDuration } from '../value-objects/service-duration';
import { ServiceId } from '../value-objects/service-id';
import { ServiceName } from '../value-objects/service-name';

interface ServiceProps {
  id: ServiceId;
  name: ServiceName;
  description: string | null;
  price: Money;
  duration: ServiceDuration;
  status: ServiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateServiceInput {
  id: ServiceId;
  name: ServiceName;
  description?: string | null;
  price: Money;
  duration: ServiceDuration;
  now: Date;
}

interface UpdateServiceInput {
  name?: ServiceName;
  /** `null` clears the description; omitting the field leaves it untouched. */
  description?: string | null;
  price?: Money;
  duration?: ServiceDuration;
}

export class Service extends AggregateRoot {
  private constructor(private readonly props: ServiceProps) {
    super();
  }

  static create(input: CreateServiceInput): Service {
    const service = new Service({
      id: input.id,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      duration: input.duration,
      status: ServiceStatus.Active,
      createdAt: input.now,
      updatedAt: input.now,
    });
    service.record(new ServiceCreated(input.id.value, input.now));
    return service;
  }

  static restore(props: ServiceProps): Service {
    return new Service({ ...props });
  }

  updateDetails(input: UpdateServiceInput, now: Date): void {
    if (input.name !== undefined) {
      this.props.name = input.name;
    }
    if (input.description !== undefined) {
      this.props.description = input.description;
    }
    if (input.price !== undefined) {
      this.props.price = input.price;
    }
    if (input.duration !== undefined) {
      this.props.duration = input.duration;
    }
    this.props.updatedAt = now;
    this.record(new ServiceUpdated(this.props.id.value, now));
  }

  deactivate(now: Date): void {
    if (this.props.status === ServiceStatus.Inactive) {
      return;
    }
    this.props.status = ServiceStatus.Inactive;
    this.props.updatedAt = now;
    this.record(new ServiceDeactivated(this.props.id.value, now));
  }

  get id(): ServiceId {
    return this.props.id;
  }

  get name(): ServiceName {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get price(): Money {
    return this.props.price;
  }

  get duration(): ServiceDuration {
    return this.props.duration;
  }

  get status(): ServiceStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
