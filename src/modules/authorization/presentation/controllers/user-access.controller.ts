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
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AddUserToGroupCommand } from '../../application/commands/add-user-to-group/add-user-to-group.command';
import { AssignRoleToUserCommand } from '../../application/commands/assign-role-to-user/assign-role-to-user.command';
import { RemoveUserFromGroupCommand } from '../../application/commands/remove-user-from-group/remove-user-from-group.command';
import { RevokeRoleFromUserCommand } from '../../application/commands/revoke-role-from-user/revoke-role-from-user.command';
import { AppPermission } from '../../application/contracts/app-permissions';
import { UserAccessDto } from '../../application/ports/rbac-query.port';
import { GetUserAccessQuery } from '../../application/queries/get-user-access/get-user-access.query';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { UserAccessResponseDto } from '../dtos/user-access.dtos';

@ApiTags('authorization')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('users')
export class UserAccessController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':userId/access')
  @RequirePermissions(AppPermission.UserAccessRead)
  @ApiOperation({ summary: 'Get the roles and groups assigned to a user' })
  @ApiOkResponse({ type: UserAccessResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getUserAccess(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserAccessResponseDto> {
    return this.queryBus.execute<GetUserAccessQuery, UserAccessDto>(
      new GetUserAccessQuery(userId),
    );
  }

  @Put(':userId/roles/:roleId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user (idempotent)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async assignRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.commandBus.execute<AssignRoleToUserCommand, void>(
      new AssignRoleToUserCommand(userId, { id: roleId }),
    );
  }

  @Delete(':userId/roles/:roleId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a role from a user (idempotent)' })
  @ApiNoContentResponse()
  async revokeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.commandBus.execute<RevokeRoleFromUserCommand, void>(
      new RevokeRoleFromUserCommand(userId, roleId),
    );
  }

  @Put(':userId/groups/:groupId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a user to a group (idempotent)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async addToGroup(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.commandBus.execute<AddUserToGroupCommand, void>(
      new AddUserToGroupCommand(userId, groupId),
    );
  }

  @Delete(':userId/groups/:groupId')
  @RequirePermissions(AppPermission.UserAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user from a group (idempotent)' })
  @ApiNoContentResponse()
  async removeFromGroup(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.commandBus.execute<RemoveUserFromGroupCommand, void>(
      new RemoveUserFromGroupCommand(userId, groupId),
    );
  }
}
