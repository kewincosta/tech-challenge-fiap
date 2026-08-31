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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { RequirePermissions } from '../../../authorization/presentation/decorators/require-permissions.decorator';
import {
  CreatedServiceDto,
  CreateServiceCommand,
} from '../../application/commands/create-service/create-service.command';
import { DeactivateServiceCommand } from '../../application/commands/deactivate-service/deactivate-service.command';
import { UpdateServiceCommand } from '../../application/commands/update-service/update-service.command';
import { ServiceSummaryDto } from '../../application/ports/service-query.port';
import { GetServiceQuery } from '../../application/queries/get-service/get-service.query';
import { ListServicesQuery } from '../../application/queries/list-services/list-services.query';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { CreateServiceRequestDto } from '../dtos/create-service.request.dto';
import { UpdateServiceRequestDto } from '../dtos/update-service.request.dto';
import { CreatedServiceResponseDto, ServiceResponseDto } from '../dtos/service.response.dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.ServicesManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a catalog service' })
  @ApiCreatedResponse({ type: CreatedServiceResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async create(@Body() body: CreateServiceRequestDto): Promise<CreatedServiceResponseDto> {
    return this.commandBus.execute<CreateServiceCommand, CreatedServiceDto>(
      new CreateServiceCommand(
        body.name,
        body.priceCents,
        body.estimatedDurationMinutes,
        body.description,
      ),
    );
  }

  @Get()
  @RequirePermissions(AppPermission.ServicesRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the active catalog services' })
  @ApiOkResponse({ type: [ServiceResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(): Promise<ServiceResponseDto[]> {
    const services = await this.queryBus.execute<ListServicesQuery, ServiceSummaryDto[]>(
      new ListServicesQuery(),
    );
    return services.map((service) => this.toResponseDto(service));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.ServicesRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a catalog service by id, active or deactivated' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getById(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<ServiceResponseDto> {
    return this.getServiceOrThrow(externalId);
  }

  @Patch(':externalId')
  @RequirePermissions(AppPermission.ServicesManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a catalog service' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: UpdateServiceRequestDto,
  ): Promise<ServiceResponseDto> {
    await this.commandBus.execute<UpdateServiceCommand, void>(
      new UpdateServiceCommand(
        externalId,
        body.name,
        body.description,
        body.priceCents,
        body.estimatedDurationMinutes,
      ),
    );
    return this.getServiceOrThrow(externalId);
  }

  @Delete(':externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AppPermission.ServicesManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a catalog service (the record is kept)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async deactivate(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<void> {
    await this.commandBus.execute<DeactivateServiceCommand, void>(
      new DeactivateServiceCommand(externalId),
    );
  }

  private async getServiceOrThrow(externalId: string): Promise<ServiceResponseDto> {
    const service = await this.queryBus.execute<GetServiceQuery, ServiceSummaryDto | null>(
      new GetServiceQuery(externalId),
    );
    if (!service) {
      throw new ServiceNotFoundError();
    }
    return this.toResponseDto(service);
  }

  private toResponseDto(service: ServiceSummaryDto): ServiceResponseDto {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      priceCents: service.priceCents,
      estimatedDurationMinutes: service.estimatedDurationMinutes,
      status: service.status,
    };
  }
}
