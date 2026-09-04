import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission } from '../../application/contracts/app-permissions';
import { PermissionDto } from '../../application/ports/rbac-query.port';
import { ListPermissionsQuery } from '../../application/queries/list-permissions/list-permissions.query';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PermissionResponseDto } from '../dtos/permission.dtos';

@ApiTags('authorization')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermissions(AppPermission.PermissionsRead)
  @ApiOperation({ summary: 'List the permission catalog' })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(): Promise<PermissionResponseDto[]> {
    return this.queryBus.execute<ListPermissionsQuery, PermissionDto[]>(new ListPermissionsQuery());
  }
}
