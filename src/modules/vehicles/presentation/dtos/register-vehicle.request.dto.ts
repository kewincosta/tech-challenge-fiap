import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';

const MIN_YEAR = 1950;
const MAX_YEAR = 2100; // generous upper bound - VehicleYear.create enforces the real, moving one

export class RegisterVehicleRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: 'ABC-1234' })
  @IsString()
  @IsNotEmpty()
  plate!: string;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  brand!: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @IsNotEmpty()
  model!: string;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year!: number;
}
