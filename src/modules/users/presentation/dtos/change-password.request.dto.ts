import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordRequestDto {
  @ApiProperty({ example: 'CurrentPassword1' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'NewStrongerPassword2', minLength: 8, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}
