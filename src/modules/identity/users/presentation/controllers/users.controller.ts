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
import { authThrottle } from '../../../../../config/rate-limit.config';
import { ErrorResponseDto } from '../../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { GetUserEffectiveAccessHandler } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.handler';
import { GetUserEffectiveAccessQuery } from '../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { AllowsPendingPassword } from '../../../authentication/presentation/decorators/allows-pending-password.decorator';
import { CurrentUser } from '../../../authentication/presentation/decorators/current-user.decorator';
import { Public } from '../../../authentication/presentation/decorators/public.decorator';
import { Principal } from '../../../authentication/presentation/principal';
import { RequirePermissions } from '../../../authorization/presentation/decorators/require-permissions.decorator';
import { ChangePasswordCommand } from '../../application/commands/change-password/change-password.command';
import { ChangePasswordHandler } from '../../application/commands/change-password/change-password.handler';
import { DeactivateUserCommand } from '../../application/commands/deactivate-user/deactivate-user.command';
import { DeactivateUserHandler } from '../../application/commands/deactivate-user/deactivate-user.handler';
import { RegisterUserCommand } from '../../application/commands/register-user/register-user.command';
import { RegisterUserHandler } from '../../application/commands/register-user/register-user.handler';
import { UpdateUserCommand } from '../../application/commands/update-user/update-user.command';
import { UpdateUserHandler } from '../../application/commands/update-user/update-user.handler';
import { GetUserByIdHandler } from '../../application/queries/get-user-by-id/get-user-by-id.handler';
import { GetUserByIdQuery } from '../../application/queries/get-user-by-id/get-user-by-id.query';
import { ListUsersHandler } from '../../application/queries/list-users/list-users.handler';
import { ListUsersQuery } from '../../application/queries/list-users/list-users.query';
import { ChangePasswordRequestDto } from '../dtos/change-password.request.dto';
import { CreateStaffAccountRequestDto } from '../dtos/create-staff-account.request.dto';
import { RegisterUserRequestDto } from '../dtos/register-user.request.dto';
import { UpdateUserRequestDto } from '../dtos/update-user.request.dto';
import {
  CurrentUserResponseDto,
  RegisteredUserResponseDto,
  StaffAccountResponseDto,
  UserResponseDto,
  UserSummaryResponseDto,
} from '../dtos/user.response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly registerUser: RegisterUserHandler,
    private readonly updateUser: UpdateUserHandler,
    private readonly deactivateUser: DeactivateUserHandler,
    private readonly changeUserPassword: ChangePasswordHandler,
    private readonly listUsers: ListUsersHandler,
    private readonly getUser: GetUserByIdHandler,
    private readonly getUserEffectiveAccess: GetUserEffectiveAccessHandler,
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
    return this.registerUser.execute(
      new RegisterUserCommand(body.email, body.name, body.password, body.document),
    );
  }

  @Post('staff')
  @RequirePermissions(AppPermission.UsersManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an account with a system-generated temporary password',
    description:
      'The workshop never invents a password for someone else (IDENT-07). The response carries ' +
      'the generated password once; the account must change it before using any other route.',
  })
  @ApiCreatedResponse({ type: StaffAccountResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async createStaffAccount(
    @Body() body: CreateStaffAccountRequestDto,
  ): Promise<StaffAccountResponseDto> {
    const result = await this.registerUser.execute(
      new RegisterUserCommand(body.email, body.name, undefined, body.document, true),
    );
    return { id: result.id, temporaryPassword: result.temporaryPassword! };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user with effective roles and permissions' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async me(@CurrentUser() principal: Principal): Promise<CurrentUserResponseDto> {
    const user = await this.getUser.execute(new GetUserByIdQuery(principal.userId));
    const access = await this.getUserEffectiveAccess.execute(
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
    await this.updateUser.execute(
      new UpdateUserCommand(principal.userId, body.name, body.email, body.document),
    );
    return this.getUser.execute(new GetUserByIdQuery(principal.userId));
  }

  @Post('me/password')
  @AllowsPendingPassword()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the authenticated user own password, revoking every session' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async changePassword(
    @CurrentUser() principal: Principal,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    await this.changeUserPassword.execute(
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
    return this.listUsers.execute(new ListUsersQuery(role, document));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.UsersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<UserResponseDto> {
    return this.getUser.execute(new GetUserByIdQuery(externalId));
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
    await this.updateUser.execute(
      new UpdateUserCommand(externalId, body.name, body.email, body.document),
    );
    return this.getUser.execute(new GetUserByIdQuery(externalId));
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
    await this.deactivateUser.execute(new DeactivateUserCommand(externalId));
  }
}
