import { ApiProperty } from '@nestjs/swagger';

export class UserAccessRoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CUSTOMER' })
  name!: string;
}

export class UserAccessGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Workshop Staff' })
  name!: string;
}

export class UserAccessResponseDto {
  @ApiProperty({ type: [UserAccessRoleResponseDto] })
  roles!: UserAccessRoleResponseDto[];

  @ApiProperty({ type: [UserAccessGroupResponseDto] })
  groups!: UserAccessGroupResponseDto[];
}
