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
import { AppPermission, RequirePermissions } from '../../../identity';
import { CreateServiceCommand } from '../../application/commands/create-service/create-service.command';
import { CreateServiceUseCase } from '../../application/commands/create-service/create-service.use-case';
import { DeactivateServiceCommand } from '../../application/commands/deactivate-service/deactivate-service.command';
import { DeactivateServiceUseCase } from '../../application/commands/deactivate-service/deactivate-service.use-case';
import { UpdateServiceCommand } from '../../application/commands/update-service/update-service.command';
import { UpdateServiceUseCase } from '../../application/commands/update-service/update-service.use-case';
import { ServiceSummaryDto } from '../../application/ports/service-query.port';
import { GetServiceUseCase } from '../../application/queries/get-service/get-service.use-case';
import { GetServiceQuery } from '../../application/queries/get-service/get-service.query';
import { ListServicesUseCase } from '../../application/queries/list-services/list-services.use-case';
import { ListServicesQuery } from '../../application/queries/list-services/list-services.query';
import { CreateServiceRequestDto } from '../dtos/create-service.request.dto';
import { UpdateServiceRequestDto } from '../dtos/update-service.request.dto';
import { CreatedServiceResponseDto, ServiceResponseDto } from '../dtos/service.response.dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(
    private readonly createService: CreateServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deactivateService: DeactivateServiceUseCase,
    private readonly getService: GetServiceUseCase,
    private readonly listServices: ListServicesUseCase,
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
    return this.createService.execute(
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
    const services = await this.listServices.execute(new ListServicesQuery());
    return services.map((service) => this.toResponseDto(service));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.ServicesRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a catalog service by id, active or deactivated' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<ServiceResponseDto> {
    return this.toResponseDto(await this.getService.execute(new GetServiceQuery(externalId)));
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
    await this.updateService.execute(
      new UpdateServiceCommand(
        externalId,
        body.name,
        body.description,
        body.priceCents,
        body.estimatedDurationMinutes,
      ),
    );
    return this.toResponseDto(await this.getService.execute(new GetServiceQuery(externalId)));
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
    await this.deactivateService.execute(new DeactivateServiceCommand(externalId));
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
