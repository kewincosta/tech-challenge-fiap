import { ApiProperty } from '@nestjs/swagger';

export class RegisteredUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: '2026-08-26T12:00:00.000Z' })
  createdAt!: string;
}

export class CurrentUserResponseDto extends UserResponseDto {
  @ApiProperty({ type: [String], example: ['CUSTOMER'] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['users:read'] })
  permissions!: string[];
}

export class UserSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: '11144477735' })
  document!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;
}
