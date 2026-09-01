import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

export class ApplyDiscountRequestDto {
  @ApiProperty({ example: 1000, description: 'Integer BRL cents' })
  @IsInt()
  @IsPositive()
  amountCents!: number;

  @ApiProperty({ example: 'Cliente reclamou do prazo', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note!: string;
}
