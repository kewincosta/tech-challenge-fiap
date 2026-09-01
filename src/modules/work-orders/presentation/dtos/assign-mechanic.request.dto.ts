import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignMechanicRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mechanicUserId!: string;
}
