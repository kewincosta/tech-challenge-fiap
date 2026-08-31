import { ApiProperty } from '@nestjs/swagger';

export class RegisteredVehicleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class VehicleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ example: 'ABC1234' })
  plate!: string;

  @ApiProperty({ example: 'Toyota' })
  brand!: string;

  @ApiProperty({ example: 'Corolla' })
  model!: string;

  @ApiProperty({ example: 2020 })
  year!: number;
}
