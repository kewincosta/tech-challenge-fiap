import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddRequestedServiceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;
}
