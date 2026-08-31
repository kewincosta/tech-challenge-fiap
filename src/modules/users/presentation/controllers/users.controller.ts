import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
import {
  RegisteredUserDto,
  RegisterUserCommand,
} from '../../application/commands/register-user/register-user.command';
import { UserDto } from '../../application/dtos/user.dto';
import { GetUserByIdQuery } from '../../application/queries/get-user-by-id/get-user-by-id.query';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { RegisterUserRequestDto } from '../dtos/register-user.request.dto';
import {
  CurrentUserResponseDto,
  RegisteredUserResponseDto,
  UserResponseDto,
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
      new RegisterUserCommand(body.email, body.name, body.password),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user with effective roles and permissions' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async me(@CurrentUser() principal: Principal): Promise<CurrentUserResponseDto> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(principal.userId),
    );
    if (!user) {
      throw new UserNotFoundError();
    }
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(principal.userId),
    );
    return { ...user, roles: access.roles, permissions: access.permissions };
  }

  @Get(':id')
  @RequirePermissions(AppPermission.UsersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(id),
    );
    if (!user) {
      throw new UserNotFoundError();
    }
    return user;
  }
}
