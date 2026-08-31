import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;

  @ApiProperty({ format: 'uuid', description: 'Opaque single use refresh token' })
  refreshToken!: string;

  @ApiProperty({ example: '2026-09-02T12:00:00.000Z' })
  refreshTokenExpiresAt!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;
}
