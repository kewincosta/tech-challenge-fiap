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
import { ApplyDiscountCommand } from '../../application/commands/apply-discount/apply-discount.command';
import { ApproveBudgetCommand } from '../../application/commands/approve-budget/approve-budget.command';
import { AssignMechanicCommand } from '../../application/commands/assign-mechanic/assign-mechanic.command';
import { CancelWorkOrderCommand } from '../../application/commands/cancel-work-order/cancel-work-order.command';
import { CompleteDiagnosisCommand } from '../../application/commands/complete-diagnosis/complete-diagnosis.command';
import { CompleteWorkOrderCommand } from '../../application/commands/complete-work-order/complete-work-order.command';
import {
  CreatedWorkOrderDto,
  CreateWorkOrderCommand,
} from '../../application/commands/create-work-order/create-work-order.command';
import { DeliverVehicleCommand } from '../../application/commands/deliver-vehicle/deliver-vehicle.command';
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
import { AverageExecutionTimeDto } from '../../application/ports/work-order-metrics-query.port';
import { GetAverageExecutionTimeQuery } from '../../application/queries/get-average-execution-time/get-average-execution-time.query';
import { GetMyWorkOrderQuery } from '../../application/queries/get-my-work-order/get-my-work-order.query';
import { GetMyWorkOrdersQuery } from '../../application/queries/get-my-work-orders/get-my-work-orders.query';
import { GetWorkOrderTrailQuery } from '../../application/queries/get-work-order-trail/get-work-order-trail.query';
import { GetWorkOrderQuery } from '../../application/queries/get-work-order/get-work-order.query';
import { ListWorkOrdersQuery } from '../../application/queries/list-work-orders/list-work-orders.query';
import { WorkOrderNotFoundError } from '../../domain/errors/work-order-not-found.error';
import { AddRequestedServiceRequestDto } from '../dtos/add-requested-service.request.dto';
import { ApplyDiscountRequestDto } from '../dtos/apply-discount.request.dto';
import { AssignMechanicRequestDto } from '../dtos/assign-mechanic.request.dto';
import { AverageExecutionTimeQueryDto } from '../dtos/average-execution-time.request.dto';
import { CancellationRequestDto } from '../dtos/cancellation.request.dto';
import { CreateWorkOrderRequestDto } from '../dtos/create-work-order.request.dto';
import { PlanPartRequestDto } from '../dtos/plan-part.request.dto';
import { WithdrawPartsRequestDto } from '../dtos/withdraw-parts.request.dto';
import {
  AverageExecutionTimeResponseDto,
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

  // Declared before every :number route - "me" would otherwise be read as a work order number
  // and answer 400 from WorkOrderNumber.create, never 200 (design.md's first risk).
  @Get('me')
  @RequirePermissions(AppPermission.WorkOrdersReadOwn)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated customer's own work orders" })
  @ApiOkResponse({ type: [WorkOrderResponseDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async myWorkOrders(@CurrentUser() principal: Principal): Promise<WorkOrderResponseDto[]> {
    const workOrders = await this.queryBus.execute<GetMyWorkOrdersQuery, WorkOrderSummaryDto[]>(
      new GetMyWorkOrdersQuery(principal.userId),
    );
    return workOrders.map((workOrder) => this.toResponseDto(workOrder));
  }

  // Same ordering requirement as myWorkOrders above - both me routes before :number.
  @Get('me/:number')
  @RequirePermissions(AppPermission.WorkOrdersReadOwn)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get one of the authenticated customer's own work orders by number" })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async myWorkOrder(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    const workOrder = await this.queryBus.execute<GetMyWorkOrderQuery, WorkOrderSummaryDto | null>(
      new GetMyWorkOrderQuery(principal.userId, number),
    );
    // One null for "no customer record", "no work order" and "not yours" - the same 404 either
    // way, so a stranger's number reads identically to one nobody carries (design.md).
    if (!workOrder) {
      throw new WorkOrderNotFoundError();
    }
    return this.toResponseDto(workOrder);
  }

  @Get('metrics/average-execution-time')
  @RequirePermissions(AppPermission.MetricsRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Average elapsed time between execution start and completion' })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async averageExecutionTime(
    @Query() query: AverageExecutionTimeQueryDto,
  ): Promise<AverageExecutionTimeResponseDto> {
    const result = await this.queryBus.execute<
      GetAverageExecutionTimeQuery,
      AverageExecutionTimeDto
    >(
      new GetAverageExecutionTimeQuery(
        query.serviceId,
        query.completedFrom ? new Date(query.completedFrom) : undefined,
        query.completedTo ? new Date(query.completedTo) : undefined,
      ),
    );
    return result;
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
  @ApiOperation({
    summary: 'Approve the pending budget round',
    description:
      'Allowed to the owning customer or to a holder of work-orders:decide. The route carries no ' +
      'permission decorator because that rule is an either-of-two, which the permissions guard ' +
      'cannot express; the handler enforces it and answers 404, not 403, to anyone else.',
  })
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
  @ApiOperation({
    summary: 'Reject the pending budget round',
    description:
      'Allowed to the owning customer or to a holder of work-orders:decide. The route carries no ' +
      'permission decorator because that rule is an either-of-two, which the permissions guard ' +
      'cannot express; the handler enforces it and answers 404, not 403, to anyone else.',
  })
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

  // work-orders:read is the route-level gate - every actor able to reach it holds it, so the
  // work order's existence is not a secret from them. WorkOrderCompletionAuthorizer narrows to
  // the assigned mechanic or an administrator inside the handler (design.md).
  @Post(':number/completion')
  @RequirePermissions(AppPermission.WorkOrdersRead)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete a work order in execution, charging what was withdrawn' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async completeWorkOrder(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<CompleteWorkOrderCommand, void>(
      new CompleteWorkOrderCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/delivery')
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deliver a completed work order, settling its consumptions' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async deliverVehicle(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<DeliverVehicleCommand, void>(
      new DeliverVehicleCommand(number, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  // work-orders:cancel is the route-level gate. CancellationAuthorizer additionally requires
  // work-orders:cancel-in-execution inside the handler when the work order carries an
  // outstanding withdrawn part - the guard runs after the load, because the state is only known
  // then (H36, design.md).
  @Post(':number/cancellation')
  @RequirePermissions(AppPermission.WorkOrdersCancel)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a work order, writing off any parts already withdrawn' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async cancelWorkOrder(
    @Param('number') number: string,
    @Body() body: CancellationRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<CancelWorkOrderCommand, void>(
      new CancelWorkOrderCommand(number, body.reason, principal.userId),
    );
    return this.getWorkOrderOrThrow(number);
  }

  @Post(':number/discount')
  @RequirePermissions(AppPermission.WorkOrdersDiscount)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply a discount to the charged total, with a mandatory reason' })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async applyDiscount(
    @Param('number') number: string,
    @Body() body: ApplyDiscountRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.commandBus.execute<ApplyDiscountCommand, void>(
      new ApplyDiscountCommand(number, body.amountCents, body.note, principal.userId),
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
      chargedTotalCents: workOrder.chargedTotalCents,
      discountCents: workOrder.discountCents,
      discountNote: workOrder.discountNote,
      completedAt: workOrder.completedAt,
      deliveredAt: workOrder.deliveredAt,
      canceledAt: workOrder.canceledAt,
      cancellationReason: workOrder.cancellationReason,
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
