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
