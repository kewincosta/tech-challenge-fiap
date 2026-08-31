import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, example: '203.0.113.10' })
  ip!: string | null;

  @ApiProperty({ nullable: true, example: 'Mozilla/5.0' })
  userAgent!: string | null;

  @ApiProperty({ example: '2026-08-26T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-26T12:30:00.000Z' })
  lastUsedAt!: string;

  @ApiProperty({ description: 'True when this session issued the current access token' })
  current!: boolean;
}

export class LogoutAllResponseDto {
  @ApiProperty({ example: 2 })
  revokedSessions!: number;
}
