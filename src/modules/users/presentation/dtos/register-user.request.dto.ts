import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterUserRequestDto {
  @ApiProperty({ example: 'jane.doe@example.com', maxLength: 320 })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Doe', minLength: 2, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Str0ngPassword', minLength: 8, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
