import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { AddRequestedServiceRequestDto } from './add-requested-service.request.dto';
import { PlanPartRequestDto } from './plan-part.request.dto';

export class CreateWorkOrderRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({
    type: [AddRequestedServiceRequestDto],
    description:
      'Services the customer asks for. Each becomes a draft item, as if added by ' +
      'POST /work-orders/{number}/services right after the opening.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddRequestedServiceRequestDto)
  services?: AddRequestedServiceRequestDto[];

  @ApiPropertyOptional({
    type: [PlanPartRequestDto],
    description:
      'Parts the customer asks for. Each becomes a draft item, as if planned by ' +
      'POST /work-orders/{number}/parts right after the opening. One item that cannot be ' +
      'added refuses the whole opening.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPartRequestDto)
  parts?: PlanPartRequestDto[];
}
