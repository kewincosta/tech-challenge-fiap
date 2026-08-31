import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 'AUTH_INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: 'Invalid credentials.' })
  message!: string;

  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  reference!: string;

  @ApiPropertyOptional({ type: [String], example: ['email must be an email'] })
  details?: string[];
}
