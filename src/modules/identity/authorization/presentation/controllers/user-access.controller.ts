import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../../shared/presentation/dtos/error-response.dto';
import { CurrentUser } from '../../../authentication/presentation/decorators/current-user.decorator';
import { Principal } from '../../../authentication/presentation/principal';
import { AssignRoleToUserCommand } from '../../application/commands/assign-role-to-user/assign-role-to-user.command';
import { AssignRoleToUserUseCase } from '../../application/commands/assign-role-to-user/assign-role-to-user.use-case';
import { RevokeRoleFromUserCommand } from '../../application/commands/revoke-role-from-user/revoke-role-from-user.command';
import { RevokeRoleFromUserUseCase } from '../../application/commands/revoke-role-from-user/revoke-role-from-user.use-case';
import { AppPermission } from '../../application/contracts/app-permissions';
import { GetUserAccessUseCase } from '../../application/queries/get-user-access/get-user-access.use-case';
import { GetUserAccessQuery } from '../../application/queries/get-user-access/get-user-access.query';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { UserAccessResponseDto } from '../dtos/user-access.dtos';

@ApiTags('authorization')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('users')
export class UserAccessController {
  constructor(
    private readonly assignRoleToUser: AssignRoleToUserUseCase,
    private readonly revokeRoleFromUser: RevokeRoleFromUserUseCase,
    private readonly getAccess: GetUserAccessUseCase,
  ) {}

  @Get(':userId/access')
  @RequirePermissions(AppPermission.UserAccessRead)
  @ApiOperation({ summary: 'Get the roles assigned to a user' })
  @ApiOkResponse({ type: UserAccessResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getUserAccess(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserAccessResponseDto> {
    return this.getAccess.execute(new GetUserAccessQuery(userId));
  }

  @Put(':userId/roles/:roleId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user (idempotent)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async assignRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.assignRoleToUser.execute(
      new AssignRoleToUserCommand(userId, { id: roleId }, principal.userId),
    );
  }

  @Delete(':userId/roles/:roleId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a role from a user (idempotent)' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async revokeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.revokeRoleFromUser.execute(new RevokeRoleFromUserCommand(userId, roleId));
  }
}
