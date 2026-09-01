import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatedInventoryItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class InventoryItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'FLT-001' })
  sku!: string;

  @ApiProperty({ example: 'Filtro de oleo' })
  name!: string;

  @ApiPropertyOptional({ example: 'Filtro padrao', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'PART', enum: ['PART', 'SUPPLY'] })
  kind!: string;

  @ApiProperty({ example: 2500, description: 'Unit price in integer BRL cents' })
  unitPriceCents!: number;

  @ApiProperty({ example: 7 })
  quantityOnHand!: number;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;
}

export class StockShortageResponseDto {
  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'FLT-001' })
  sku!: string;

  @ApiProperty({ example: 'Filtro de oleo' })
  name!: string;

  @ApiProperty({ example: 1 })
  quantityOnHand!: number;

  @ApiProperty({
    example: 4,
    description: 'Sum, over approved planned parts of work orders in execution, of planned minus withdrawn',
  })
  outstandingQuantity!: number;

  @ApiProperty({ example: ['A1B090-2026'], type: [String] })
  workOrderNumbers!: string[];
}

export class StockMovementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INBOUND' })
  kind!: string;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({ example: 2500, description: 'Unit price in integer BRL cents' })
  unitPriceCents!: number;

  @ApiProperty({ format: 'uuid', description: "The acting user's external id" })
  actorUserId!: string;

  @ApiPropertyOptional({ example: 'Reposicao mensal', nullable: true })
  note!: string | null;

  @ApiProperty()
  occurredAt!: Date;
}
