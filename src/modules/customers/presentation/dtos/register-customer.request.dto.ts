import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { AddressRequestDto } from './address.request.dto';

export class RegisterCustomerRequestDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'External id of an existing user. Mutually exclusive with email/name/document.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'jane.doe@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: '111.444.777-35' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  document?: string;

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
