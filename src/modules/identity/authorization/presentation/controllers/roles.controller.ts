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
import { CreateRoleCommand } from '../../application/commands/create-role/create-role.command';
import { CreateRoleUseCase } from '../../application/commands/create-role/create-role.use-case';
import { DeleteRoleCommand } from '../../application/commands/delete-role/delete-role.command';
import { DeleteRoleUseCase } from '../../application/commands/delete-role/delete-role.use-case';
import { SetRolePermissionsCommand } from '../../application/commands/set-role-permissions/set-role-permissions.command';
import { SetRolePermissionsUseCase } from '../../application/commands/set-role-permissions/set-role-permissions.use-case';
import { UpdateRoleCommand } from '../../application/commands/update-role/update-role.command';
import { UpdateRoleUseCase } from '../../application/commands/update-role/update-role.use-case';
import { AppPermission } from '../../application/contracts/app-permissions';
import { GetRoleUseCase } from '../../application/queries/get-role/get-role.use-case';
import { GetRoleQuery } from '../../application/queries/get-role/get-role.query';
import { ListRolesUseCase } from '../../application/queries/list-roles/list-roles.use-case';
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
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    private readonly setRolePermissions: SetRolePermissionsUseCase,
    private readonly listRoles: ListRolesUseCase,
    private readonly getRole: GetRoleUseCase,
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
    const created = await this.createRole.execute(
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
    await this.updateRole.execute(new UpdateRoleCommand(id, body.name, body.description));
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
    await this.deleteRole.execute(new DeleteRoleCommand(id));
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
    await this.setRolePermissions.execute(new SetRolePermissionsCommand(id, body.permissions));
    return this.getRole.execute(new GetRoleQuery(id));
  }
}
