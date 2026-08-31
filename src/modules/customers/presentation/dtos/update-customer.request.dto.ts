import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { AddressRequestDto } from './address.request.dto';

export class UpdateCustomerRequestDto {
  @ApiPropertyOptional({ type: AddressRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressRequestDto)
  address?: AddressRequestDto;

  @ApiPropertyOptional({ example: '(11) 98765-4321' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
