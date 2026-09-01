import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsInt, IsPositive, IsUUID, ValidateNested } from 'class-validator';

export class WithdrawPartsLineRequestDto {
  @ApiProperty({ format: 'uuid', description: "The work order item's own external id" })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  quantity!: number;
}

/** The withdrawal and the return routes share this exact shape (design.md). */
export class WithdrawPartsRequestDto {
  @ApiProperty({ type: [WithdrawPartsLineRequestDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => WithdrawPartsLineRequestDto)
  lines!: WithdrawPartsLineRequestDto[];
}
