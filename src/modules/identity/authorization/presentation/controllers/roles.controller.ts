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
import { CommandBus } from '@nestjs/cqrs';
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
import { ErrorResponseDto } from '../../../../../shared/presentation/dtos/error-response.dto';
import {
  CreatedRoleDto,
  CreateRoleCommand,
} from '../../application/commands/create-role/create-role.command';
import { DeleteRoleCommand } from '../../application/commands/delete-role/delete-role.command';
import { SetRolePermissionsCommand } from '../../application/commands/set-role-permissions/set-role-permissions.command';
import { UpdateRoleCommand } from '../../application/commands/update-role/update-role.command';
import { AppPermission } from '../../application/contracts/app-permissions';
import { GetRoleHandler } from '../../application/queries/get-role/get-role.handler';
import { GetRoleQuery } from '../../application/queries/get-role/get-role.query';
import { ListRolesHandler } from '../../application/queries/list-roles/list-roles.handler';
import { ListRolesQuery } from '../../application/queries/list-roles/list-roles.query';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import {
  CreateRoleRequestDto,
  RoleResponseDto,
  SetRolePermissionsRequestDto,
  UpdateRoleRequestDto,
} from '../dtos/role.dtos';

@ApiTags('authorization')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('roles')
export class RolesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly listRoles: ListRolesHandler,
    private readonly getRole: GetRoleHandler,
  ) {}

  @Get()
  @RequirePermissions(AppPermission.RolesRead)
  @ApiOperation({ summary: 'List roles' })
  @ApiOkResponse({ type: [RoleResponseDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(): Promise<RoleResponseDto[]> {
    return this.listRoles.execute(new ListRolesQuery());
  }

  @Post()
  @RequirePermissions(AppPermission.RolesManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a role' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async create(@Body() body: CreateRoleRequestDto): Promise<RoleResponseDto> {
    const created = await this.commandBus.execute<CreateRoleCommand, CreatedRoleDto>(
      new CreateRoleCommand(body.name, body.description ?? null, body.permissions ?? []),
    );
    return this.getRole.execute(new GetRoleQuery(created.id));
  }

  @Get(':id')
  @RequirePermissions(AppPermission.RolesRead)
  @ApiOperation({ summary: 'Get a role by id' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.getRole.execute(new GetRoleQuery(id));
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.RolesManage)
  @ApiOperation({ summary: 'Update role name or description' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleRequestDto,
  ): Promise<RoleResponseDto> {
    await this.commandBus.execute<UpdateRoleCommand, void>(
      new UpdateRoleCommand(id, body.name, body.description),
    );
    return this.getRole.execute(new GetRoleQuery(id));
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.RolesManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a role' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.commandBus.execute<DeleteRoleCommand, void>(new DeleteRoleCommand(id));
  }

  @Put(':id/permissions')
  @RequirePermissions(AppPermission.RolesManage)
  @ApiOperation({ summary: 'Replace the permissions of a role' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetRolePermissionsRequestDto,
  ): Promise<RoleResponseDto> {
    await this.commandBus.execute<SetRolePermissionsCommand, void>(
      new SetRolePermissionsCommand(id, body.permissions),
    );
    return this.getRole.execute(new GetRoleQuery(id));
  }
}
