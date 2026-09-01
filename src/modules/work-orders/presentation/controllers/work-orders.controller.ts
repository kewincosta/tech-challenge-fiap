import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { CurrentUser } from '../../../authentication/presentation/decorators/current-user.decorator';
import { Principal } from '../../../authentication/presentation/principal';
import { AppPermission } from '../../../authorization/application/contracts/app-permissions';
import { RequirePermissions } from '../../../authorization/presentation/decorators/require-permissions.decorator';
import { AddRequestedServiceCommand } from '../../application/commands/add-requested-service/add-requested-service.command';
import { ApproveBudgetCommand } from '../../application/commands/approve-budget/approve-budget.command';
import { AssignMechanicCommand } from '../../application/commands/assign-mechanic/assign-mechanic.command';
import { CompleteDiagnosisCommand } from '../../application/commands/complete-diagnosis/complete-diagnosis.command';
import {
  CreatedWorkOrderDto,
  CreateWorkOrderCommand,
} from '../../application/commands/create-work-order/create-work-order.command';
import { PlanPartCommand } from '../../application/commands/plan-part/plan-part.command';
import { RejectBudgetCommand } from '../../application/commands/reject-budget/reject-budget.command';
import { RemoveWorkOrderItemCommand } from '../../application/commands/remove-work-order-item/remove-work-order-item.command';
import { ReturnPartsCommand } from '../../application/commands/return-parts/return-parts.command';
import { StartDiagnosisCommand } from '../../application/commands/start-diagnosis/start-diagnosis.command';
import { SubmitSupplementaryBudgetCommand } from '../../application/commands/submit-supplementary-budget/submit-supplementary-budget.command';
import { WithdrawPartsCommand } from '../../application/commands/withdraw-parts/withdraw-parts.command';
import {
  WorkOrderSummaryDto,
  WorkOrderTrailEntryDto,
} from '../../application/ports/work-order-query.port';
import { GetWorkOrderTrailQuery } from '../../application/queries/get-work-order-trail/get-work-order-trail.query';
import { GetWorkOrderQuery } from '../../application/queries/get-work-order/get-work-order.query';
import { ListWorkOrdersQuery } from '../../application/queries/list-work-orders/list-work-orders.query';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';
import { AddRequestedServiceRequestDto } from '../dtos/add-requested-service.request.dto';
import { AssignMechanicRequestDto } from '../dtos/assign-mechanic.request.dto';
import { CreateWorkOrderRequestDto } from '../dtos/create-work-order.request.dto';
import { PlanPartRequestDto } from '../dtos/plan-part.request.dto';
import { WithdrawPartsRequestDto } from '../dtos/withdraw-parts.request.dto';
import {
  CreatedWorkOrderResponseDto,
  WorkOrderResponseDto,
  WorkOrderTrailEntryResponseDto,
} from '../dtos/work-order.response.dto';

@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open a work order for a customer and their vehicle' })
  @ApiCreatedResponse({ type: CreatedWorkOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async create(
    @Body() body: CreateWorkOrderRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<CreatedWorkOrderResponseDto> {
    return this.commandBus.execute<CreateWorkOrderCommand, CreatedWorkOrderDto>(
      new CreateWorkOrderCommand(body.customerId, body.vehicleId, principal.userId),
    );
  }

  @Get()
  @RequirePermissions(AppPermission.WorkOrdersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the work order board, filtered by status' })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ type: [WorkOrderResponseDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(@Query('status') status?: string): Promise<WorkOrderResponseDto[]> {
    const workOrders = await this.queryBus.execute<ListWorkOrdersQuery, WorkOrderSummaryDto[]>(
      new ListWorkOrdersQuery(status),
    );
    return workOrders.map((workOrder) => this.toResponseDto(workOrder));
  }

  @Get(':number')
  @RequirePermissions(AppPermission.WorkOrdersRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a work order by its number' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getByNumber(@Param('number') number: string): Promise<WorkOrderResponseDto> {
    return this.getWorkOrderOrThrow(number);
  }

  @Get(':number/trail')
  @RequirePermissions(AppPermission.AuditRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a work order's trail, in chronological order" })
  @ApiOkResponse({ type: [WorkOrderTrailEntryResponseDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getTrail(@Param('number') number: string): Promise<WorkOrderTrailEntryResponseDto[]> {
    // The 404 for an unknown number is owned here - GetWorkOrderTrailQuery never checks
    // existence on its own (T18), the same split T10 established for inventory's movement
    // history.
    await this.getWorkOrderOrThrow(number);
    const trail = await this.queryBus.execute<GetWorkOrderTrailQuery, WorkOrderTrailEntryDto[]>(
      new GetWorkOrderTrailQuery(number),
    );
    return trail.map((entry) => this.toTrailResponseDto(entry));
  }

  @Post(':number/services')
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a requested service to a work order' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async addService(
    @Param('number') number: string,
    @Body() body: AddRequestedServiceRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<AddRequestedServiceCommand, void>(
      new AddRequestedServiceCommand(number, body.serviceId, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/parts')
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Plan a part on a work order, without touching the stock' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async planPart(
    @Param('number') number: string,
    @Body() body: PlanPartRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<PlanPartCommand, void>(
      new PlanPartCommand(number, body.inventoryItemId, body.quantity, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Delete(':number/items/:itemExternalId')
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a requested service or a planned part from a work order' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async removeItem(
    @Param('number') number: string,
    @Param('itemExternalId', ParseUUIDPipe) itemExternalId: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.commandBus.execute<RemoveWorkOrderItemCommand, void>(
      new RemoveWorkOrderItemCommand(number, itemExternalId, principal.userId),
    );
  }

  @Put(':number/mechanic')
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign a mechanic to a work order' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async assignMechanic(
    @Param('number') number: string,
    @Body() body: AssignMechanicRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<AssignMechanicCommand, void>(
      new AssignMechanicCommand(number, body.mechanicUserId, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/diagnosis')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start the diagnosis of a work order that arrived' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async startDiagnosis(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<StartDiagnosisCommand, void>(
      new StartDiagnosisCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/diagnosis/completion')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete the diagnosis and generate the first budget round' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async completeDiagnosis(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<CompleteDiagnosisCommand, void>(
      new CompleteDiagnosisCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/budget/supplementary')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a supplementary budget over the draft items added during execution' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async submitSupplementaryBudget(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<SubmitSupplementaryBudgetCommand, void>(
      new SubmitSupplementaryBudgetCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/withdrawals')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw a batch of approved planned parts from stock' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async withdrawParts(
    @Param('number') number: string,
    @Body() body: WithdrawPartsRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<WithdrawPartsCommand, void>(
      new WithdrawPartsCommand(number, body.lines, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/returns')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return a batch of previously withdrawn parts to stock' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async returnParts(
    @Param('number') number: string,
    @Body() body: WithdrawPartsRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<ReturnPartsCommand, void>(
      new ReturnPartsCommand(number, body.lines, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  // No @RequirePermissions here: the rule is "the owning customer or a holder of
  // work-orders:decide", and PermissionsGuard requires every permission it is given, so it
  // cannot express an either-of-two. BudgetDecisionAuthorizer enforces it instead, inside the
  // handler, answering 404 rather than 403 to a stranger (design.md).
  @Post(':number/budget/approval')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve the pending budget round' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async approveBudget(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<ApproveBudgetCommand, void>(
      new ApproveBudgetCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  // No @RequirePermissions here - see approveBudget above.
  @Post(':number/budget/rejection')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject the pending budget round' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async rejectBudget(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<RejectBudgetCommand, void>(
      new RejectBudgetCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  private async getWorkOrderOrThrow(number: string): Promise<WorkOrderResponseDto> {
    const workOrder = await this.queryBus.execute<GetWorkOrderQuery, WorkOrderSummaryDto | null>(
      new GetWorkOrderQuery(number),
    );
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }
    return this.toResponseDto(workOrder);
  }

  private toResponseDto(workOrder: WorkOrderSummaryDto): WorkOrderResponseDto {
    return {
      id: workOrder.id,
      number: workOrder.number,
      customerId: workOrder.customerId,
      vehicleId: workOrder.vehicleId,
      assignedMechanicUserId: workOrder.assignedMechanicUserId,
      createdByUserId: workOrder.createdByUserId,
      status: workOrder.status,
      customerName: workOrder.customerName,
      vehiclePlate: workOrder.vehiclePlate,
      vehicleBrand: workOrder.vehicleBrand,
      vehicleModel: workOrder.vehicleModel,
      vehicleYear: workOrder.vehicleYear,
      serviceItems: workOrder.serviceItems,
      partItems: workOrder.partItems,
      budgets: workOrder.budgets,
    };
  }

  private toTrailResponseDto(entry: WorkOrderTrailEntryDto): WorkOrderTrailEntryResponseDto {
    return {
      id: entry.id,
      eventType: entry.eventType,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      actorUserId: entry.actorUserId,
      occurredAt: entry.occurredAt,
      note: entry.note,
    };
  }
}
