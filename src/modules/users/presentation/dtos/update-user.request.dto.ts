import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUserRequestDto {
  @ApiPropertyOptional({ example: 'Jane Doe', minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'jane.doe@example.com', maxLength: 320 })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '111.444.777-35', description: 'CPF or CNPJ, with or without punctuation' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  document?: string;
}
