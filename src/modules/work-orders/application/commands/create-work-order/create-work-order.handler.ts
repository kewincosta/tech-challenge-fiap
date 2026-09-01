import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { CustomerSummaryDto } from '../../../../customers/application/ports/customer-query.port';
import { GetCustomerQuery } from '../../../../customers/application/queries/get-customer/get-customer.query';
import { VehicleSummaryDto } from '../../../../vehicles/application/ports/vehicle-query.port';
import { GetVehicleQuery } from '../../../../vehicles/application/queries/get-vehicle/get-vehicle.query';
import { WorkOrder } from '../../../domain/entities/work-order';
import { CustomerInactiveError } from '../../../domain/errors/customer-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { ReferencedVehicleNotFoundError } from '../../../domain/errors/referenced-vehicle-not-found.error';
import { VehicleNotOwnedByCustomerError } from '../../../domain/errors/vehicle-not-owned-by-customer.error';
import { WorkOrderNumberTakenError } from '../../../domain/errors/work-order-number-taken.error';
import {
  WORK_ORDER_REPOSITORY,
  WorkOrderRepository,
} from '../../../domain/repositories/work-order.repository';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import {
  WORK_ORDER_NUMBER_GENERATOR,
  WorkOrderNumberGenerator,
} from '../../ports/work-order-number-generator.port';
import { CreatedWorkOrderDto, CreateWorkOrderCommand } from './create-work-order.command';

const ACTIVE_STATUS = 'ACTIVE';
const MAX_NUMBER_ATTEMPTS = 5;

@CommandHandler(CreateWorkOrderCommand)
export class CreateWorkOrderHandler implements ICommandHandler<
  CreateWorkOrderCommand,
  CreatedWorkOrderDto
> {
  constructor(
    @Inject(WORK_ORDER_REPOSITORY) private readonly workOrders: WorkOrderRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(WORK_ORDER_NUMBER_GENERATOR) private readonly numberGenerator: WorkOrderNumberGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateWorkOrderCommand): Promise<CreatedWorkOrderDto> {
    const customer = await this.queryBus.execute<GetCustomerQuery, CustomerSummaryDto | null>(
      new GetCustomerQuery(command.customerId),
    );
    if (!customer) {
      throw new ReferencedCustomerNotFoundError();
    }
    if (customer.status !== ACTIVE_STATUS) {
      throw new CustomerInactiveError();
    }

    const vehicle = await this.queryBus.execute<GetVehicleQuery, VehicleSummaryDto | null>(
      new GetVehicleQuery(command.vehicleId),
    );
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
        this.eventBus.publishAll(workOrder.pullDomainEvents());
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
