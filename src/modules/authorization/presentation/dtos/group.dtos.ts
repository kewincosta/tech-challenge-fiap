import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateGroupRequestDto {
  @ApiProperty({ example: 'Workshop Staff' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Every employee of the workshop' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateGroupRequestDto {
  @ApiPropertyOptional({ example: 'Workshop Staff' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Every employee of the workshop' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SetGroupRolesRequestDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}

export class SetGroupPermissionsRequestDto {
  @ApiProperty({ type: [String], example: ['users:read'] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class GroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Workshop Staff' })
  name!: string;

  @ApiProperty({ nullable: true, example: 'Every employee of the workshop' })
  description!: string | null;

  @ApiProperty({ type: [String], example: ['MECHANIC'] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['users:read'] })
  permissions!: string[];
}
