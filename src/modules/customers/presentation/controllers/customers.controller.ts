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
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission, CurrentUser, Principal, RequirePermissions } from '../../../identity';
import { DeactivateCustomerCommand } from '../../application/commands/deactivate-customer/deactivate-customer.command';
import { DeactivateCustomerUseCase } from '../../application/commands/deactivate-customer/deactivate-customer.use-case';
import { RegisterCustomerCommand } from '../../application/commands/register-customer/register-customer.command';
import { RegisterCustomerUseCase } from '../../application/commands/register-customer/register-customer.use-case';
import { UpdateCustomerCommand } from '../../application/commands/update-customer/update-customer.command';
import { UpdateCustomerUseCase } from '../../application/commands/update-customer/update-customer.use-case';
import { CustomerSummaryDto } from '../../application/ports/customer-query.port';
import { GetCustomerByUserIdUseCase } from '../../application/queries/get-customer-by-user-id/get-customer-by-user-id.use-case';
import { GetCustomerByUserIdQuery } from '../../application/queries/get-customer-by-user-id/get-customer-by-user-id.query';
import { GetCustomerUseCase } from '../../application/queries/get-customer/get-customer.use-case';
import { GetCustomerQuery } from '../../application/queries/get-customer/get-customer.query';
import { ListCustomersUseCase } from '../../application/queries/list-customers/list-customers.use-case';
import { ListCustomersQuery } from '../../application/queries/list-customers/list-customers.query';
import { RegisterCustomerRequestDto } from '../dtos/register-customer.request.dto';
import { UpdateCustomerRequestDto } from '../dtos/update-customer.request.dto';
import { CustomerResponseDto, RegisteredCustomerResponseDto } from '../dtos/customer.response.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly registerCustomer: RegisterCustomerUseCase,
    private readonly updateCustomer: UpdateCustomerUseCase,
    private readonly deactivateCustomer: DeactivateCustomerUseCase,
    private readonly getCustomer: GetCustomerUseCase,
    private readonly getCustomerByUserId: GetCustomerByUserIdUseCase,
    private readonly listCustomers: ListCustomersUseCase,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.CustomersManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a customer, over an existing user or creating one' })
  @ApiCreatedResponse({ type: RegisteredCustomerResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async register(@Body() body: RegisterCustomerRequestDto): Promise<RegisteredCustomerResponseDto> {
    return this.registerCustomer.execute(
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
    return this.toResponseDto(
      await this.getCustomerByUserId.execute(new GetCustomerByUserIdQuery(principal.userId)),
    );
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
    const customer = await this.getCustomerByUserId.execute(
      new GetCustomerByUserIdQuery(principal.userId),
    );
    await this.updateCustomer.execute(
      new UpdateCustomerCommand(customer.id, body.address, body.phoneNumber),
    );
    return this.toResponseDto(await this.getCustomer.execute(new GetCustomerQuery(customer.id)));
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
    const customers = await this.listCustomers.execute(new ListCustomersQuery(name, document));
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
    return this.toResponseDto(await this.getCustomer.execute(new GetCustomerQuery(externalId)));
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
    await this.updateCustomer.execute(
      new UpdateCustomerCommand(externalId, body.address, body.phoneNumber),
    );
    return this.toResponseDto(await this.getCustomer.execute(new GetCustomerQuery(externalId)));
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
    await this.deactivateCustomer.execute(new DeactivateCustomerCommand(externalId));
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
