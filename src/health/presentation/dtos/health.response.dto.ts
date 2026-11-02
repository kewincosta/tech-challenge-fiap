import { ApiProperty } from '@nestjs/swagger';

export class LiveResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}

export class ReadinessChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'] })
  redis!: 'up' | 'down';
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ok', 'error'], description: 'ok only when every check is up' })
  status!: 'ok' | 'error';

  @ApiProperty({ type: ReadinessChecksDto })
  checks!: ReadinessChecksDto;
}
