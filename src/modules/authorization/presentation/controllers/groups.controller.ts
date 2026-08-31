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
  Put,
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
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import {
  CreatedGroupDto,
  CreateGroupCommand,
} from '../../application/commands/create-group/create-group.command';
import { DeleteGroupCommand } from '../../application/commands/delete-group/delete-group.command';
import { SetGroupPermissionsCommand } from '../../application/commands/set-group-permissions/set-group-permissions.command';
import { SetGroupRolesCommand } from '../../application/commands/set-group-roles/set-group-roles.command';
import { UpdateGroupCommand } from '../../application/commands/update-group/update-group.command';
import { AppPermission } from '../../application/contracts/app-permissions';
import { GroupDto } from '../../application/ports/rbac-query.port';
import { GetGroupQuery } from '../../application/queries/get-group/get-group.query';
import { ListGroupsQuery } from '../../application/queries/list-groups/list-groups.query';
import { GroupNotFoundError } from '../../domain/errors/group-not-found.error';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import {
  CreateGroupRequestDto,
  GroupResponseDto,
  SetGroupPermissionsRequestDto,
  SetGroupRolesRequestDto,
  UpdateGroupRequestDto,
} from '../dtos/group.dtos';

@ApiTags('authorization')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(AppPermission.GroupsRead)
  @ApiOperation({ summary: 'List groups' })
  @ApiOkResponse({ type: [GroupResponseDto] })
  async list(): Promise<GroupResponseDto[]> {
    return this.queryBus.execute<ListGroupsQuery, GroupDto[]>(new ListGroupsQuery());
  }

  @Post()
  @RequirePermissions(AppPermission.GroupsManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ type: GroupResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async create(@Body() body: CreateGroupRequestDto): Promise<GroupResponseDto> {
    const created = await this.commandBus.execute<CreateGroupCommand, CreatedGroupDto>(
      new CreateGroupCommand(body.name, body.description ?? null),
    );
    return this.getGroupOrFail(created.id);
  }

  @Get(':id')
  @RequirePermissions(AppPermission.GroupsRead)
  @ApiOperation({ summary: 'Get a group by id' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<GroupResponseDto> {
    return this.getGroupOrFail(id);
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.GroupsManage)
  @ApiOperation({ summary: 'Update group name or description' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGroupRequestDto,
  ): Promise<GroupResponseDto> {
    await this.commandBus.execute<UpdateGroupCommand, void>(
      new UpdateGroupCommand(id, body.name, body.description),
    );
    return this.getGroupOrFail(id);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.GroupsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a group' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.commandBus.execute<DeleteGroupCommand, void>(new DeleteGroupCommand(id));
  }

  @Put(':id/roles')
  @RequirePermissions(AppPermission.GroupsManage)
  @ApiOperation({ summary: 'Replace the roles of a group' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetGroupRolesRequestDto,
  ): Promise<GroupResponseDto> {
    await this.commandBus.execute<SetGroupRolesCommand, void>(
      new SetGroupRolesCommand(id, body.roleIds),
    );
    return this.getGroupOrFail(id);
  }

  @Put(':id/permissions')
  @RequirePermissions(AppPermission.GroupsManage)
  @ApiOperation({ summary: 'Replace the direct permissions of a group' })
  @ApiOkResponse({ type: GroupResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetGroupPermissionsRequestDto,
  ): Promise<GroupResponseDto> {
    await this.commandBus.execute<SetGroupPermissionsCommand, void>(
      new SetGroupPermissionsCommand(id, body.permissions),
    );
    return this.getGroupOrFail(id);
  }

  private async getGroupOrFail(id: string): Promise<GroupResponseDto> {
    const group = await this.queryBus.execute<GetGroupQuery, GroupDto | null>(
      new GetGroupQuery(id),
    );
    if (!group) {
      throw new GroupNotFoundError();
    }
    return group;
  }
}
