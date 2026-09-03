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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { CurrentUser } from '../../../authentication/presentation/decorators/current-user.decorator';
import { Principal } from '../../../authentication/presentation/principal';
import { RequirePermissions } from '../../../authorization/presentation/decorators/require-permissions.decorator';
import { DeactivateCustomerCommand } from '../../application/commands/deactivate-customer/deactivate-customer.command';
import {
  RegisteredCustomerDto,
  RegisterCustomerCommand,
} from '../../application/commands/register-customer/register-customer.command';
import { UpdateCustomerCommand } from '../../application/commands/update-customer/update-customer.command';
import { GetCustomerByUserIdQuery } from '../../application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { GetCustomerQuery } from '../../application/queries/get-customer/get-customer.query';
import { ListCustomersQuery } from '../../application/queries/list-customers/list-customers.query';
import { CustomerSummaryDto } from '../../application/ports/customer-query.port';
import { CustomerNotFoundError } from '../../domain/errors/customer-not-found.error';
import { RegisterCustomerRequestDto } from '../dtos/register-customer.request.dto';
import { UpdateCustomerRequestDto } from '../dtos/update-customer.request.dto';
import { CustomerResponseDto, RegisteredCustomerResponseDto } from '../dtos/customer.response.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.CustomersManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a customer, over an existing user or creating one' })
  @ApiCreatedResponse({ type: RegisteredCustomerResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async register(
    @Body() body: RegisterCustomerRequestDto,
  ): Promise<RegisteredCustomerResponseDto> {
    return this.commandBus.execute<RegisterCustomerCommand, RegisteredCustomerDto>(
      new RegisterCustomerCommand(
        body.userId,
        body.email,
        body.name,
        body.document,
        body.address,
        body.phoneNumber,
      ),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user own customer record' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async me(@CurrentUser() principal: Principal): Promise<CustomerResponseDto> {
    return this.getOwnCustomerOrThrow(principal.userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the authenticated user own customer record' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async updateMe(
    @CurrentUser() principal: Principal,
    @Body() body: UpdateCustomerRequestDto,
  ): Promise<CustomerResponseDto> {
    const customer = await this.getOwnCustomerSummaryOrThrow(principal.userId);
    await this.commandBus.execute<UpdateCustomerCommand, void>(
      new UpdateCustomerCommand(customer.id, body.address, body.phoneNumber),
    );
    return this.getCustomerOrThrow(customer.id);
  }

  @Get()
  @RequirePermissions(AppPermission.CustomersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active customers, filtered by name and by document' })
  @ApiQuery({ name: 'name', required: false, example: 'Jane' })
  @ApiQuery({ name: 'document', required: false, example: '11144477735' })
  @ApiOkResponse({ type: [CustomerResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(
    @Query('name') name?: string,
    @Query('document') document?: string,
  ): Promise<CustomerResponseDto[]> {
    const customers = await this.queryBus.execute<ListCustomersQuery, CustomerSummaryDto[]>(
      new ListCustomersQuery(name, document),
    );
    return customers.map((customer) => this.toResponseDto(customer));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.CustomersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a customer by id' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<CustomerResponseDto> {
    return this.getCustomerOrThrow(externalId);
  }

  @Patch(':externalId')
  @RequirePermissions(AppPermission.CustomersManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a customer record' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: UpdateCustomerRequestDto,
  ): Promise<CustomerResponseDto> {
    await this.commandBus.execute<UpdateCustomerCommand, void>(
      new UpdateCustomerCommand(externalId, body.address, body.phoneNumber),
    );
    return this.getCustomerOrThrow(externalId);
  }

  @Delete(':externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AppPermission.CustomersManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a customer (soft delete)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async deactivate(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<void> {
    await this.commandBus.execute<DeactivateCustomerCommand, void>(
      new DeactivateCustomerCommand(externalId),
    );
  }

  private async getOwnCustomerOrThrow(userId: string): Promise<CustomerResponseDto> {
    const customer = await this.getOwnCustomerSummaryOrThrow(userId);
    return this.toResponseDto(customer);
  }

  private async getOwnCustomerSummaryOrThrow(userId: string): Promise<CustomerSummaryDto> {
    const customer = await this.queryBus.execute<GetCustomerByUserIdQuery, CustomerSummaryDto | null>(
      new GetCustomerByUserIdQuery(userId),
    );
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    return customer;
  }

  private async getCustomerOrThrow(externalId: string): Promise<CustomerResponseDto> {
    const customer = await this.queryBus.execute<GetCustomerQuery, CustomerSummaryDto | null>(
      new GetCustomerQuery(externalId),
    );
    if (!customer) {
      throw new CustomerNotFoundError();
    }
    return this.toResponseDto(customer);
  }

  private toResponseDto(customer: CustomerSummaryDto): CustomerResponseDto {
    return {
      id: customer.id,
      userId: customer.userId,
      name: customer.name,
      email: customer.email,
      document: customer.document,
      address: customer.address,
      phoneNumber: customer.phoneNumber,
      status: customer.status,
    };
  }
}
