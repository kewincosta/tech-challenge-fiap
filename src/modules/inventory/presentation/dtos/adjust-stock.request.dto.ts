import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AdjustStockRequestDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  // Left optional at this layer on purpose: a missing or blank note must surface as the domain's
  // own AdjustmentNoteRequiredError (design.md's Error Handling), not a generic DTO validation
  // error - the aggregate is the single place this rule is enforced.
  @ApiPropertyOptional({ example: 'Contagem divergente', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
