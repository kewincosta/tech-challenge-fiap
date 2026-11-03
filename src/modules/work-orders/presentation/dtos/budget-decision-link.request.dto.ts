import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class BudgetDecisionLinkQueryDto {
  @ApiProperty({
    example: '3c64ce548c17bb2d06154d75289431b2',
    description:
      'The hash that ends the address in the e-mail and in the work order answer. It tells one ' +
      'generation of the budget from the next, so an address sent before the budget was ' +
      'generated again is refused with 422 WORK_ORDER_BUDGET_LINK_OUTDATED',
  })
  @IsString()
  @IsNotEmpty()
  link!: string;
}
