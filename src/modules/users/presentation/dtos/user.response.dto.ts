import { ApiProperty } from '@nestjs/swagger';

export class RegisteredUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class StaffAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'aB3dE5fG7h9K',
    description: 'Shown once. Hand it to the account holder; it cannot be retrieved again.',
  })
  temporaryPassword!: string;
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

  @ApiProperty({ example: false })
  mustChangePassword!: boolean;

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
