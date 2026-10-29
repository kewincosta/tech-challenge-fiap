import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { WorkOrder } from '../../../domain/entities/work-order';
import { CustomerInactiveError } from '../../../domain/errors/customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { ReferencedVehicleNotFoundError } from '../../../domain/errors/referenced-vehicle-not-found.error';
import { VehicleNotOwnedByCustomerError } from '../../../domain/errors/vehicle-not-owned-by-customer.error';
import { WorkOrderNumberTakenError } from '../../../domain/errors/work-order-number-taken.error';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CustomerDirectory } from '../../ports/customer-directory.port';
import { VehicleDirectory } from '../../ports/vehicle-directory.port';
import { WorkOrderNumberGenerator } from '../../ports/work-order-number-generator.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import { CreatedWorkOrderDto, CreateWorkOrderCommand } from './create-work-order.command';

const MAX_NUMBER_ATTEMPTS = 5;

export class CreateWorkOrderUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly customers: CustomerDirectory,
    private readonly vehicles: VehicleDirectory,
    private readonly idGenerator: IdGenerator,
    private readonly numberGenerator: WorkOrderNumberGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateWorkOrderCommand): Promise<CreatedWorkOrderDto> {
    const customer = await this.customers.findById(command.customerId);
    if (!customer) {
      throw new ReferencedCustomerNotFoundError();
    }
    if (!customer.active) {
      throw new CustomerInactiveError();
    }

    const vehicle = await this.vehicles.findById(command.vehicleId);
    if (!vehicle) {
      throw new ReferencedVehicleNotFoundError();
    }
    if (vehicle.customerId !== command.customerId) {
      throw new VehicleNotOwnedByCustomerError();
    }

    const now = this.clock.now();
    let lastError: unknown;
    // A drawn number colliding is expected, not exceptional (design.md) - retried up to five
    // times. Any other failure, notably VehicleAlreadyHasActiveWorkOrderError, propagates on the
    // first attempt and is never retried.
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
      const workOrder = WorkOrder.open({
        id: WorkOrderId.create(this.idGenerator.generate()),
        number: WorkOrderNumber.create(this.numberGenerator.next(now.getFullYear())),
        customerId: command.customerId,
        vehicleId: command.vehicleId,
        createdByUserId: command.createdByUserId,
        customerName: customer.name,
        vehiclePlate: vehicle.plate,
        vehicleBrand: vehicle.brand,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        now,
      });
      try {
        await this.workOrders.save(workOrder);
        this.events.publish(workOrder.pullDomainEvents());
        return { id: workOrder.id.value, number: workOrder.number.value };
      } catch (error) {
        if (!(error instanceof WorkOrderNumberTakenError)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError;
  }
}
