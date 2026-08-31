import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RefreshTokenRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Opaque single use refresh token' })
  @IsUUID()
  refreshToken!: string;
}
