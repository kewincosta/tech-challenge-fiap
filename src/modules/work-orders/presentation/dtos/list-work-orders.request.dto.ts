import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WorkOrderStatus } from '../../domain/work-order-status';

/** `status=A,B` and `status=A&status=B` both name two statuses. Anything else is left for the
 * validator to refuse. */
function splitStatuses(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.split(',');
  }
  if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')) {
    return value.flatMap((entry) => entry.split(','));
  }
  return value;
}

export class ListWorkOrdersQueryDto {
  @ApiProperty({ minimum: 1, example: 1, description: 'The page to read, counted from 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 100,
    example: 20,
    description: 'How many work orders a page holds',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize!: number;

  @ApiPropertyOptional({
    type: String,
    example: 'CANCELED,DELIVERED',
    description:
      'One or more of RECEIVED, IN_DIAGNOSIS, AWAITING_APPROVAL, IN_EXECUTION, COMPLETED, ' +
      'DELIVERED and CANCELED, separated by commas. Without it the board lists IN_EXECUTION, ' +
      'AWAITING_APPROVAL, IN_DIAGNOSIS and RECEIVED.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => splitStatuses(value))
  @IsEnum(WorkOrderStatus, { each: true })
  status?: WorkOrderStatus[];
}
