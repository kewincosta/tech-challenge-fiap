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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission, CurrentUser, Principal, RequirePermissions } from '../../../identity';
import { RegisterVehicleCommand } from '../../application/commands/register-vehicle/register-vehicle.command';
import { RegisterVehicleHandler } from '../../application/commands/register-vehicle/register-vehicle.handler';
import { RemoveVehicleCommand } from '../../application/commands/remove-vehicle/remove-vehicle.command';
import { RemoveVehicleHandler } from '../../application/commands/remove-vehicle/remove-vehicle.handler';
import { UpdateVehicleCommand } from '../../application/commands/update-vehicle/update-vehicle.command';
import { UpdateVehicleHandler } from '../../application/commands/update-vehicle/update-vehicle.handler';
import { VehicleSummaryDto } from '../../application/ports/vehicle-query.port';
import { GetMyVehiclesHandler } from '../../application/queries/get-my-vehicles/get-my-vehicles.handler';
import { GetMyVehiclesQuery } from '../../application/queries/get-my-vehicles/get-my-vehicles.query';
import { GetVehicleHandler } from '../../application/queries/get-vehicle/get-vehicle.handler';
import { GetVehicleQuery } from '../../application/queries/get-vehicle/get-vehicle.query';
import { ListVehiclesByCustomerHandler } from '../../application/queries/list-vehicles-by-customer/list-vehicles-by-customer.handler';
import { ListVehiclesByCustomerQuery } from '../../application/queries/list-vehicles-by-customer/list-vehicles-by-customer.query';
import { RegisterVehicleRequestDto } from '../dtos/register-vehicle.request.dto';
import { UpdateVehicleRequestDto } from '../dtos/update-vehicle.request.dto';
import { RegisteredVehicleResponseDto, VehicleResponseDto } from '../dtos/vehicle.response.dto';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly registerVehicle: RegisterVehicleHandler,
    private readonly updateVehicle: UpdateVehicleHandler,
    private readonly removeVehicle: RemoveVehicleHandler,
    private readonly getVehicle: GetVehicleHandler,
    private readonly listVehiclesByCustomer: ListVehiclesByCustomerHandler,
    private readonly getMyVehicles: GetMyVehiclesHandler,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.VehiclesManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a vehicle for an active customer' })
  @ApiCreatedResponse({ type: RegisteredVehicleResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async register(@Body() body: RegisterVehicleRequestDto): Promise<RegisteredVehicleResponseDto> {
    return this.registerVehicle.execute(
      new RegisterVehicleCommand(body.customerId, body.plate, body.brand, body.model, body.year),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the authenticated person own vehicles' })
  @ApiOkResponse({ type: [VehicleResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async myVehicles(@CurrentUser() principal: Principal): Promise<VehicleResponseDto[]> {
    const vehicles = await this.getMyVehicles.execute(new GetMyVehiclesQuery(principal.userId));
    return vehicles.map((vehicle) => this.toResponseDto(vehicle));
  }

  @Get()
  @RequirePermissions(AppPermission.VehiclesRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List a customer's active vehicles" })
  @ApiQuery({ name: 'customerId', required: true, format: 'uuid' })
  @ApiOkResponse({ type: [VehicleResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(
    @Query('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<VehicleResponseDto[]> {
    const vehicles = await this.listVehiclesByCustomer.execute(
      new ListVehiclesByCustomerQuery(customerId),
    );
    return vehicles.map((vehicle) => this.toResponseDto(vehicle));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.VehiclesRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a vehicle by id' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<VehicleResponseDto> {
    return this.toResponseDto(await this.getVehicle.execute(new GetVehicleQuery(externalId)));
  }

  @Patch(':externalId')
  @RequirePermissions(AppPermission.VehiclesManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a vehicle's details, or transfer its ownership" })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: UpdateVehicleRequestDto,
  ): Promise<VehicleResponseDto> {
    await this.updateVehicle.execute(
      new UpdateVehicleCommand(externalId, body.brand, body.model, body.year, body.customerId),
    );
    return this.toResponseDto(await this.getVehicle.execute(new GetVehicleQuery(externalId)));
  }

  @Delete(':externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AppPermission.VehiclesManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a vehicle (soft delete)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async remove(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<void> {
    await this.removeVehicle.execute(new RemoveVehicleCommand(externalId));
  }

  private toResponseDto(vehicle: VehicleSummaryDto): VehicleResponseDto {
    return {
      id: vehicle.id,
      customerId: vehicle.customerId,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
    };
  }
}
