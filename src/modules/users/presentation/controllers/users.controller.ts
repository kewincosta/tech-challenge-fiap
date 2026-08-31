import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { authThrottle } from '../../../../config/rate-limit.config';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { EffectiveAccessDto } from '../../../authorization/application/dtos/effective-access.dto';
import { CurrentUser } from '../../../authentication/presentation/decorators/current-user.decorator';
import { Public } from '../../../authentication/presentation/decorators/public.decorator';
import { Principal } from '../../../authentication/presentation/principal';
import { RequirePermissions } from '../../../authorization/presentation/decorators/require-permissions.decorator';
import { ChangePasswordCommand } from '../../application/commands/change-password/change-password.command';
import { DeactivateUserCommand } from '../../application/commands/deactivate-user/deactivate-user.command';
import {
  RegisteredUserDto,
  RegisterUserCommand,
} from '../../application/commands/register-user/register-user.command';
import { UpdateUserCommand } from '../../application/commands/update-user/update-user.command';
import { UserDto } from '../../application/dtos/user.dto';
import { GetUserByIdQuery } from '../../application/queries/get-user-by-id/get-user-by-id.query';
import { ListUsersQuery } from '../../application/queries/list-users/list-users.query';
import { UserSummaryDto } from '../../application/ports/user-query.port';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { ChangePasswordRequestDto } from '../dtos/change-password.request.dto';
import { RegisterUserRequestDto } from '../dtos/register-user.request.dto';
import { UpdateUserRequestDto } from '../dtos/update-user.request.dto';
import {
  CurrentUserResponseDto,
  RegisteredUserResponseDto,
  UserResponseDto,
  UserSummaryResponseDto,
} from '../dtos/user.response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
  @Throttle({ default: authThrottle() })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiCreatedResponse({ type: RegisteredUserResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async register(@Body() body: RegisterUserRequestDto): Promise<RegisteredUserResponseDto> {
    return this.commandBus.execute<RegisterUserCommand, RegisteredUserDto>(
      new RegisterUserCommand(body.email, body.name, body.password, body.document),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user with effective roles and permissions' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async me(@CurrentUser() principal: Principal): Promise<CurrentUserResponseDto> {
    const user = await this.getUserOrThrow(principal.userId);
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(principal.userId),
    );
    return { ...user, roles: access.roles, permissions: access.permissions };
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the authenticated user own personal data' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async updateMe(
    @CurrentUser() principal: Principal,
    @Body() body: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    await this.commandBus.execute<UpdateUserCommand, void>(
      new UpdateUserCommand(principal.userId, body.name, body.email, body.document),
    );
    return this.getUserOrThrow(principal.userId);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the authenticated user own password, revoking every session' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async changePassword(
    @CurrentUser() principal: Principal,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    await this.commandBus.execute<ChangePasswordCommand, void>(
      new ChangePasswordCommand(principal.userId, body.currentPassword, body.newPassword),
    );
  }

  @Get()
  @RequirePermissions(AppPermission.UsersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active users, filtered by role and by document' })
  @ApiQuery({ name: 'role', required: false, example: 'MECHANIC' })
  @ApiQuery({ name: 'document', required: false, example: '11144477735' })
  @ApiOkResponse({ type: [UserSummaryResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(
    @Query('role') role?: string,
    @Query('document') document?: string,
  ): Promise<UserSummaryResponseDto[]> {
    return this.queryBus.execute<ListUsersQuery, UserSummaryDto[]>(
      new ListUsersQuery(role, document),
    );
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.UsersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getById(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<UserResponseDto> {
    return this.getUserOrThrow(externalId);
  }

  @Patch(':externalId')
  @RequirePermissions(AppPermission.UsersManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a staff or customer account' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    await this.commandBus.execute<UpdateUserCommand, void>(
      new UpdateUserCommand(externalId, body.name, body.email, body.document),
    );
    return this.getUserOrThrow(externalId);
  }

  @Delete(':externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AppPermission.UsersManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate an account (soft delete)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async deactivate(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<void> {
    await this.commandBus.execute<DeactivateUserCommand, void>(
      new DeactivateUserCommand(externalId),
    );
  }

  private async getUserOrThrow(userId: string): Promise<UserResponseDto> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(userId),
    );
    if (!user) {
      throw new UserNotFoundError();
    }
    return user;
  }
}
