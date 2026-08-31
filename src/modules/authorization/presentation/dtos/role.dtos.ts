import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleRequestDto {
  @ApiProperty({ example: 'WORKSHOP_MANAGER' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Manages workshop operations' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['users:read', 'roles:read'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleRequestDto {
  @ApiPropertyOptional({ example: 'WORKSHOP_MANAGER' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Manages workshop operations' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SetRolePermissionsRequestDto {
  @ApiProperty({ type: [String], example: ['users:read', 'roles:read'] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'WORKSHOP_MANAGER' })
  name!: string;

  @ApiProperty({ nullable: true, example: 'Manages workshop operations' })
  description!: string | null;

  @ApiProperty({ example: false })
  isSystem!: boolean;

  @ApiProperty({ type: [String], example: ['users:read'] })
  permissions!: string[];
}
