import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisteredCustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({
    example: 'aB3dE5fG7h9K',
    description: 'Present only when a new account was created. Shown once.',
  })
  temporaryPassword?: string;
}

export class AddressResponseDto {
  @ApiProperty() street!: string;
  @ApiProperty() number!: string;
  @ApiPropertyOptional({ nullable: true }) complement!: string | null;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() zipCode!: string;
}

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: '11144477735' })
  document!: string;

  @ApiProperty({ type: AddressResponseDto, nullable: true })
  address!: AddressResponseDto | null;

  @ApiProperty({ example: '11987654321', nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;
}
