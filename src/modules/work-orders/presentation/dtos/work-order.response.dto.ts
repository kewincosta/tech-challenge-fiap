import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatedWorkOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A1B090-2026' })
  number!: string;
}

export class WorkOrderServiceItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ example: 'Troca de oleo' })
  serviceName!: string;

  @ApiProperty({ example: 15099, description: 'Unit price in integer BRL cents' })
  unitPriceCents!: number;

  @ApiPropertyOptional({ example: 1, nullable: true, description: 'Null while still a draft' })
  budgetRound!: number | null;

  @ApiPropertyOptional({
    example: 15099,
    nullable: true,
    description: 'Frozen at generation, in integer BRL cents. Null while still a draft',
  })
  budgetedUnitPriceCents!: number | null;
}

export class WorkOrderPartItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'FLT-001' })
  sku!: string;

  @ApiProperty({ example: 'Filtro de oleo' })
  itemName!: string;

  @ApiProperty({ example: 2 })
  plannedQuantity!: number;

  @ApiProperty({ example: 0 })
  withdrawnQuantity!: number;

  @ApiProperty({ example: 2500, description: 'Unit price in integer BRL cents' })
  unitPriceCents!: number;

  @ApiPropertyOptional({ example: 1, nullable: true, description: 'Null while still a draft' })
  budgetRound!: number | null;

  @ApiPropertyOptional({
    example: 2500,
    nullable: true,
    description: 'Frozen at generation, in integer BRL cents. Null while still a draft',
  })
  budgetedUnitPriceCents!: number | null;
}

export class WorkOrderBudgetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1 })
  round!: number;

  @ApiProperty({ example: 20099, description: 'Total in integer BRL cents' })
  totalCents!: number;

  @ApiProperty({ example: 'PENDING' })
  status!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  decidedAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  decidedByUserId!: string | null;
}

export class WorkOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'A1B090-2026' })
  number!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  assignedMechanicUserId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty({ example: 'RECEIVED' })
  status!: string;

  @ApiProperty({ example: 'Jane Doe' })
  customerName!: string;

  @ApiProperty({ example: 'ABC1234' })
  vehiclePlate!: string;

  @ApiProperty({ example: 'Toyota' })
  vehicleBrand!: string;

  @ApiProperty({ example: 'Corolla' })
  vehicleModel!: string;

  @ApiProperty({ example: 2020 })
  vehicleYear!: number;

  @ApiProperty({ type: [WorkOrderServiceItemResponseDto] })
  serviceItems!: WorkOrderServiceItemResponseDto[];

  @ApiProperty({ type: [WorkOrderPartItemResponseDto] })
  partItems!: WorkOrderPartItemResponseDto[];

  @ApiProperty({ type: [WorkOrderBudgetResponseDto], description: 'Ordered by round' })
  budgets!: WorkOrderBudgetResponseDto[];

  @ApiPropertyOptional({
    example: 20099,
    nullable: true,
    description: 'Services plus withdrawn parts minus the discount, in integer BRL cents. Null before completion',
  })
  chargedTotalCents!: number | null;

  @ApiProperty({ example: 0, description: 'Integer BRL cents' })
  discountCents!: number;

  @ApiPropertyOptional({ nullable: true })
  discountNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  deliveredAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  canceledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancellationReason!: string | null;
}

export class WorkOrderTrailEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'WORK_ORDER_CREATED' })
  eventType!: string;

  @ApiPropertyOptional({ example: 'RECEIVED', nullable: true })
  fromStatus!: string | null;

  @ApiPropertyOptional({ example: 'RECEIVED', nullable: true })
  toStatus!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiProperty()
  occurredAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;
}

export class AverageExecutionTimeResponseDto {
  @ApiProperty({ example: 259200, description: 'Whole seconds between execution start and completion' })
  averageSeconds!: number;

  @ApiProperty({ example: 12, description: 'How many work orders the average was computed over' })
  workOrderCount!: number;

  @ApiProperty({
    example: false,
    description:
      'True only when a service filter was given. A work order carrying several services ' +
      'contributes its whole elapsed time to each, so the figure is not a decomposition of the total.',
  })
  approximated!: boolean;
}
