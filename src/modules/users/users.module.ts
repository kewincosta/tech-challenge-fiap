import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { RegisterUserHandler } from './application/commands/register-user/register-user.handler';
import { GetUserByIdHandler } from './application/queries/get-user-by-id/get-user-by-id.handler';
import { VerifyCredentialsHandler } from './application/queries/verify-credentials/verify-credentials.handler';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { UsersController } from './presentation/controllers/users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  controllers: [UsersController],
  providers: [
    RegisterUserHandler,
    GetUserByIdHandler,
    VerifyCredentialsHandler,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
  ],
})
export class UsersModule {}
