import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { WorkOrder } from '../../../domain/entities/work-order';
import { CustomerInactiveError } from '../../../domain/errors/customer-inactive.error';
import { InventoryItemInactiveError } from '../../../domain/errors/inventory-item-inactive.error';
import { ReferencedCustomerNotFoundError } from '../../../domain/errors/referenced-customer-not-found.error';
import { ReferencedInventoryItemNotFoundError } from '../../../domain/errors/referenced-inventory-item-not-found.error';
import { ReferencedServiceNotFoundError } from '../../../domain/errors/referenced-service-not-found.error';
import { ReferencedVehicleNotFoundError } from '../../../domain/errors/referenced-vehicle-not-found.error';
import { ServiceInactiveError } from '../../../domain/errors/service-inactive.error';
import { VehicleNotOwnedByCustomerError } from '../../../domain/errors/vehicle-not-owned-by-customer.error';
import { WorkOrderNumberTakenError } from '../../../domain/errors/work-order-number-taken.error';
import { PlannedQuantity } from '../../../domain/value-objects/planned-quantity';
import { WorkOrderId } from '../../../domain/value-objects/work-order-id';
import { WorkOrderItemId } from '../../../domain/value-objects/work-order-item-id';
import { WorkOrderNumber } from '../../../domain/value-objects/work-order-number';
import { CustomerDirectory } from '../../ports/customer-directory.port';
import { PartCatalog, PartRef } from '../../ports/part-catalog.port';
import { ServiceCatalog, ServiceRef } from '../../ports/service-catalog.port';
import { VehicleDirectory } from '../../ports/vehicle-directory.port';
import { WorkOrderNumberGenerator } from '../../ports/work-order-number-generator.port';
import { WorkOrderRepository } from '../../ports/work-order.repository';
import {
  CreatedWorkOrderDto,
  CreateWorkOrderCommand,
  OpeningPartLine,
} from './create-work-order.command';

const MAX_NUMBER_ATTEMPTS = 5;

interface OpeningPart {
  inventoryItemId: string;
  part: PartRef;
  quantity: PlannedQuantity;
}

export class CreateWorkOrderUseCase {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly customers: CustomerDirectory,
    private readonly vehicles: VehicleDirectory,
    private readonly idGenerator: IdGenerator,
    private readonly numberGenerator: WorkOrderNumberGenerator,
    private readonly clock: Clock,
    private readonly serviceCatalog: ServiceCatalog,
    private readonly partCatalog: PartCatalog,
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

    // Every item is resolved before the work order exists, so one that cannot be added stops the
    // opening with nothing saved.
    const services = await this.resolveServices(command.serviceIds);
    const parts = await this.resolveParts(command.parts);

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
      // The aggregate's own item rules, as if each item were added right after the opening.
      for (const { serviceId, service } of services) {
        workOrder.addService({
          itemId: WorkOrderItemId.create(this.idGenerator.generate()),
          serviceId,
          serviceName: service.name,
          unitPrice: Money.fromCents(service.priceCents),
          actorUserId: command.createdByUserId,
          now,
        });
      }
      for (const { inventoryItemId, part, quantity } of parts) {
        workOrder.planPart({
          itemId: WorkOrderItemId.create(this.idGenerator.generate()),
          inventoryItemId,
          sku: part.sku,
          itemName: part.name,
          unitPrice: Money.fromCents(part.unitPriceCents),
          plannedQuantity: quantity,
          actorUserId: command.createdByUserId,
          now,
        });
      }
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

  private async resolveServices(
    serviceIds: readonly string[],
  ): Promise<Array<{ serviceId: string; service: ServiceRef }>> {
    const resolved: Array<{ serviceId: string; service: ServiceRef }> = [];
    for (const serviceId of serviceIds) {
      const service = await this.serviceCatalog.findById(serviceId);
      if (!service) {
        throw new ReferencedServiceNotFoundError();
      }
      if (!service.active) {
        throw new ServiceInactiveError();
      }
      resolved.push({ serviceId, service });
    }
    return resolved;
  }

  private async resolveParts(lines: readonly OpeningPartLine[]): Promise<OpeningPart[]> {
    const resolved: OpeningPart[] = [];
    for (const line of lines) {
      // Validated before the read: a malformed quantity needs no round trip to find out.
      const quantity = PlannedQuantity.create(line.quantity);
      const part = await this.partCatalog.findById(line.inventoryItemId);
      if (!part) {
        throw new ReferencedInventoryItemNotFoundError();
      }
      if (!part.active) {
        throw new InventoryItemInactiveError();
      }
      resolved.push({ inventoryItemId: line.inventoryItemId, part, quantity });
    }
    return resolved;
  }
}
