import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';
import { MAX_PLANNED_QUANTITY } from '../../domain/value-objects/planned-quantity';

export class PlanPartRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({ example: 2, maximum: MAX_PLANNED_QUANTITY })
  @IsInt()
  @IsPositive()
  @Max(MAX_PLANNED_QUANTITY)
  quantity!: number;
}
