import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { USER_QUERY_PORT } from './application/ports/user-query.port';
import { DeactivateUserHandler } from './application/commands/deactivate-user/deactivate-user.handler';
import { RegisterUserHandler } from './application/commands/register-user/register-user.handler';
import { UpdateUserHandler } from './application/commands/update-user/update-user.handler';
import { FindUserByDocumentHandler } from './application/queries/find-user-by-document/find-user-by-document.handler';
import { GetUserByIdHandler } from './application/queries/get-user-by-id/get-user-by-id.handler';
import { ListUsersHandler } from './application/queries/list-users/list-users.handler';
import { VerifyCredentialsHandler } from './application/queries/verify-credentials/verify-credentials.handler';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { TypeOrmUserQueryAdapter } from './infrastructure/persistence/typeorm-user-query.adapter';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { UserOrmEntity } from './infrastructure/persistence/user.orm-entity';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { UsersController } from './presentation/controllers/users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  controllers: [UsersController],
  providers: [
    RegisterUserHandler,
    UpdateUserHandler,
    DeactivateUserHandler,
    GetUserByIdHandler,
    VerifyCredentialsHandler,
    FindUserByDocumentHandler,
    ListUsersHandler,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_QUERY_PORT, useClass: TypeOrmUserQueryAdapter },
  ],
})
export class UsersModule {}
