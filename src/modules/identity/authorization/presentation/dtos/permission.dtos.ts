import { ApiProperty } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'users:read' })
  code!: string;

  @ApiProperty({ nullable: true, example: 'Read any user account' })
  description!: string | null;
}
