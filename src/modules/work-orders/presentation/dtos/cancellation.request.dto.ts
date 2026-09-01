import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancellationRequestDto {
  @ApiProperty({ example: 'Cliente desistiu do servico', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}
