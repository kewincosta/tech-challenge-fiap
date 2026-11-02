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
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission, CurrentUser, Principal, RequirePermissions } from '../../../identity';
import { AddRequestedServiceCommand } from '../../application/commands/add-requested-service/add-requested-service.command';
import { AddRequestedServiceUseCase } from '../../application/commands/add-requested-service/add-requested-service.use-case';
import { ApplyDiscountCommand } from '../../application/commands/apply-discount/apply-discount.command';
import { ApplyDiscountUseCase } from '../../application/commands/apply-discount/apply-discount.use-case';
import { ApproveBudgetCommand } from '../../application/commands/approve-budget/approve-budget.command';
import { ApproveBudgetUseCase } from '../../application/commands/approve-budget/approve-budget.use-case';
import { AssignMechanicCommand } from '../../application/commands/assign-mechanic/assign-mechanic.command';
import { AssignMechanicUseCase } from '../../application/commands/assign-mechanic/assign-mechanic.use-case';
import { CancelWorkOrderCommand } from '../../application/commands/cancel-work-order/cancel-work-order.command';
import { CancelWorkOrderUseCase } from '../../application/commands/cancel-work-order/cancel-work-order.use-case';
import { CompleteDiagnosisCommand } from '../../application/commands/complete-diagnosis/complete-diagnosis.command';
import { CompleteDiagnosisUseCase } from '../../application/commands/complete-diagnosis/complete-diagnosis.use-case';
import { CompleteWorkOrderCommand } from '../../application/commands/complete-work-order/complete-work-order.command';
import { CompleteWorkOrderUseCase } from '../../application/commands/complete-work-order/complete-work-order.use-case';
import { CreateWorkOrderCommand } from '../../application/commands/create-work-order/create-work-order.command';
import { CreateWorkOrderUseCase } from '../../application/commands/create-work-order/create-work-order.use-case';
import { DeliverVehicleCommand } from '../../application/commands/deliver-vehicle/deliver-vehicle.command';
import { DeliverVehicleUseCase } from '../../application/commands/deliver-vehicle/deliver-vehicle.use-case';
import { PlanPartCommand } from '../../application/commands/plan-part/plan-part.command';
import { PlanPartUseCase } from '../../application/commands/plan-part/plan-part.use-case';
import { RejectBudgetCommand } from '../../application/commands/reject-budget/reject-budget.command';
import { RejectBudgetUseCase } from '../../application/commands/reject-budget/reject-budget.use-case';
import { RemoveWorkOrderItemCommand } from '../../application/commands/remove-work-order-item/remove-work-order-item.command';
import { RemoveWorkOrderItemUseCase } from '../../application/commands/remove-work-order-item/remove-work-order-item.use-case';
import { ReturnPartsCommand } from '../../application/commands/return-parts/return-parts.command';
import { ReturnPartsUseCase } from '../../application/commands/return-parts/return-parts.use-case';
import { StartDiagnosisCommand } from '../../application/commands/start-diagnosis/start-diagnosis.command';
import { StartDiagnosisUseCase } from '../../application/commands/start-diagnosis/start-diagnosis.use-case';
import { SubmitSupplementaryBudgetCommand } from '../../application/commands/submit-supplementary-budget/submit-supplementary-budget.command';
import { SubmitSupplementaryBudgetUseCase } from '../../application/commands/submit-supplementary-budget/submit-supplementary-budget.use-case';
import { WithdrawPartsCommand } from '../../application/commands/withdraw-parts/withdraw-parts.command';
import { WithdrawPartsUseCase } from '../../application/commands/withdraw-parts/withdraw-parts.use-case';
import {
  WorkOrderBudgetDto,
  WorkOrderSummaryDto,
  WorkOrderTrailEntryDto,
} from '../../application/ports/work-order-query.port';
import { GetAverageExecutionTimeUseCase } from '../../application/queries/get-average-execution-time/get-average-execution-time.use-case';
import { GetAverageExecutionTimeQuery } from '../../application/queries/get-average-execution-time/get-average-execution-time.query';
import { GetMyWorkOrderUseCase } from '../../application/queries/get-my-work-order/get-my-work-order.use-case';
import { GetMyWorkOrderQuery } from '../../application/queries/get-my-work-order/get-my-work-order.query';
import { GetMyWorkOrdersUseCase } from '../../application/queries/get-my-work-orders/get-my-work-orders.use-case';
import { GetMyWorkOrdersQuery } from '../../application/queries/get-my-work-orders/get-my-work-orders.query';
import { GetWorkOrderTrailUseCase } from '../../application/queries/get-work-order-trail/get-work-order-trail.use-case';
import { GetWorkOrderTrailQuery } from '../../application/queries/get-work-order-trail/get-work-order-trail.query';
import { GetWorkOrderUseCase } from '../../application/queries/get-work-order/get-work-order.use-case';
import { GetWorkOrderQuery } from '../../application/queries/get-work-order/get-work-order.query';
import { ListWorkOrdersUseCase } from '../../application/queries/list-work-orders/list-work-orders.use-case';
import { ListWorkOrdersQuery } from '../../application/queries/list-work-orders/list-work-orders.query';
import { BudgetStatus } from '../../domain/budget-status';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { workOrderStatusLabel } from '../../domain/work-order-status-label';
import { AddRequestedServiceRequestDto } from '../dtos/add-requested-service.request.dto';
import { ApplyDiscountRequestDto } from '../dtos/apply-discount.request.dto';
import { AssignMechanicRequestDto } from '../dtos/assign-mechanic.request.dto';
import { AverageExecutionTimeQueryDto } from '../dtos/average-execution-time.request.dto';
import { CancellationRequestDto } from '../dtos/cancellation.request.dto';
import { CreateWorkOrderRequestDto } from '../dtos/create-work-order.request.dto';
import { ListWorkOrdersQueryDto } from '../dtos/list-work-orders.request.dto';
import { PlanPartRequestDto } from '../dtos/plan-part.request.dto';
import { WithdrawPartsRequestDto } from '../dtos/withdraw-parts.request.dto';
import {
  AverageExecutionTimeResponseDto,
  CreatedWorkOrderResponseDto,
  WorkOrderBudgetResponseDto,
  WorkOrderPageResponseDto,
  WorkOrderResponseDto,
  WorkOrderTrailEntryResponseDto,
} from '../dtos/work-order.response.dto';
import { HttpBudgetDecisionLinks } from '../http-budget-decision-links';

@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly createWorkOrderUseCase: CreateWorkOrderUseCase,
    private readonly addRequestedServiceUseCase: AddRequestedServiceUseCase,
    private readonly planPartUseCase: PlanPartUseCase,
    private readonly removeWorkOrderItemUseCase: RemoveWorkOrderItemUseCase,
    private readonly assignMechanicUseCase: AssignMechanicUseCase,
    private readonly startDiagnosisUseCase: StartDiagnosisUseCase,
    private readonly completeDiagnosisUseCase: CompleteDiagnosisUseCase,
    private readonly submitSupplementaryBudgetUseCase: SubmitSupplementaryBudgetUseCase,
    private readonly approveBudgetUseCase: ApproveBudgetUseCase,
    private readonly rejectBudgetUseCase: RejectBudgetUseCase,
    private readonly withdrawPartsUseCase: WithdrawPartsUseCase,
    private readonly returnPartsUseCase: ReturnPartsUseCase,
    private readonly completeWorkOrderUseCase: CompleteWorkOrderUseCase,
    private readonly deliverVehicleUseCase: DeliverVehicleUseCase,
    private readonly cancelWorkOrderUseCase: CancelWorkOrderUseCase,
    private readonly applyDiscountUseCase: ApplyDiscountUseCase,
    private readonly getWorkOrderUseCase: GetWorkOrderUseCase,
    private readonly listWorkOrdersUseCase: ListWorkOrdersUseCase,
    private readonly getWorkOrderTrailUseCase: GetWorkOrderTrailUseCase,
    private readonly getMyWorkOrdersUseCase: GetMyWorkOrdersUseCase,
    private readonly getMyWorkOrderUseCase: GetMyWorkOrderUseCase,
    private readonly getAverageExecutionTimeUseCase: GetAverageExecutionTimeUseCase,
    private readonly budgetLinks: HttpBudgetDecisionLinks,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.WorkOrdersManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Open a work order for a customer and their vehicle',
    description:
      'Optionally carries the services and parts the customer asks for, each one a draft item. ' +
      'One item that cannot be added refuses the whole opening and creates no work order.',
  })
  @ApiCreatedResponse({ type: CreatedWorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async create(
    @Body() body: CreateWorkOrderRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<CreatedWorkOrderResponseDto> {
    return this.createWorkOrderUseCase.execute(
      new CreateWorkOrderCommand(
        body.customerId,
        body.vehicleId,
        principal.userId,
        body.services?.map((service) => service.serviceId) ?? [],
        body.parts?.map((part) => ({
          inventoryItemId: part.inventoryItemId,
          quantity: part.quantity,
        })) ?? [],
      ),
    );
  }

  @Get()
  @RequirePermissions(AppPermission.WorkOrdersRead)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List the work order board, one page at a time',
    description:
      'Without a status, lists the work still open: IN_EXECUTION, AWAITING_APPROVAL, ' +
      'IN_DIAGNOSIS and RECEIVED, in that order and the oldest first within each. A status ' +
      'filter lists exactly the statuses it names, in the same order, completed, delivered and ' +
      'canceled ones included. A page past the last answers 200 with no items.',
  })
  @ApiOkResponse({ type: WorkOrderPageResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(@Query() query: ListWorkOrdersQueryDto): Promise<WorkOrderPageResponseDto> {
    const page = await this.listWorkOrdersUseCase.execute(
      new ListWorkOrdersQuery(query.page, query.pageSize, query.status ?? []),
    );
    return { ...page, items: page.items.map((workOrder) => this.toResponseDto(workOrder)) };
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
    const workOrders = await this.getMyWorkOrdersUseCase.execute(
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
    return this.toResponseDto(
      await this.getMyWorkOrderUseCase.execute(new GetMyWorkOrderQuery(principal.userId, number)),
    );
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
    return this.getAverageExecutionTimeUseCase.execute(
      new GetAverageExecutionTimeQuery(
        query.serviceId,
        query.completedFrom ? new Date(query.completedFrom) : undefined,
        query.completedTo ? new Date(query.completedTo) : undefined,
      ),
    );
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
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  @Get(':number/trail')
  @RequirePermissions(AppPermission.AuditRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a work order's trail, in chronological order" })
  @ApiOkResponse({ type: [WorkOrderTrailEntryResponseDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getTrail(@Param('number') number: string): Promise<WorkOrderTrailEntryResponseDto[]> {
    const trail = await this.getWorkOrderTrailUseCase.execute(new GetWorkOrderTrailQuery(number));
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
    await this.addRequestedServiceUseCase.execute(
      new AddRequestedServiceCommand(number, body.serviceId, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.planPartUseCase.execute(
      new PlanPartCommand(number, body.inventoryItemId, body.quantity, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.removeWorkOrderItemUseCase.execute(
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
    await this.assignMechanicUseCase.execute(
      new AssignMechanicCommand(number, body.mechanicUserId, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.startDiagnosisUseCase.execute(new StartDiagnosisCommand(number, principal.userId));
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.completeDiagnosisUseCase.execute(
      new CompleteDiagnosisCommand(number, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  @Post(':number/budget/supplementary')
  @RequirePermissions(AppPermission.WorkOrdersExecute)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a supplementary budget over the draft items added during execution',
  })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async submitSupplementaryBudget(
    @Param('number') number: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.submitSupplementaryBudgetUseCase.execute(
      new SubmitSupplementaryBudgetCommand(number, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.withdrawPartsUseCase.execute(
      new WithdrawPartsCommand(number, body.lines, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.returnPartsUseCase.execute(
      new ReturnPartsCommand(number, body.lines, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  // No @RequirePermissions here: the rule is "the owning customer or a holder of
  // work-orders:decide", and PermissionsGuard requires every permission it is given, so it
  // cannot express an either-of-two. BudgetDecisionAuthorizer enforces it instead, inside the
  // use case, answering 404 rather than 403 to a stranger (design.md).
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
    await this.approveBudgetUseCase.execute(new ApproveBudgetCommand(number, principal.userId));
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.rejectBudgetUseCase.execute(new RejectBudgetCommand(number, principal.userId));
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  // No @RequirePermissions here, for the reason given at approveBudget above. This pair is what
  // `approvalUrl` and `rejectionUrl` point at: the same decision as the round-less pair, but of the
  // budget the link names, so an old link cannot decide a round the customer never saw.
  @Post(':number/budgets/:budgetId/approval')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Approve one budget, the one a link names',
    description:
      'The address `approvalUrl` carries on a pending budget. Allowed to the owning customer and to a ' +
      'holder of work-orders:decide; anyone else gets 404 WORK_ORDER_NOT_FOUND. A budget that is not ' +
      "one of the work order's answers 404 WORK_ORDER_BUDGET_NOT_FOUND, and one that is no longer " +
      'pending answers 422 BUDGET_INVALID_STATE.',
  })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async approveBudgetByLink(
    @Param('number') number: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.approveBudgetUseCase.execute(
      new ApproveBudgetCommand(number, principal.userId, budgetId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  // No @RequirePermissions here, for the reason given at approveBudget above.
  @Post(':number/budgets/:budgetId/rejection')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reject one budget, the one a link names',
    description:
      'The address `rejectionUrl` carries on a pending budget. Allowed to the owning customer and to a ' +
      'holder of work-orders:decide; anyone else gets 404 WORK_ORDER_NOT_FOUND. A budget that is not ' +
      "one of the work order's answers 404 WORK_ORDER_BUDGET_NOT_FOUND, and one that is no longer " +
      'pending answers 422 BUDGET_INVALID_STATE.',
  })
  @ApiOkResponse({ type: WorkOrderResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async rejectBudgetByLink(
    @Param('number') number: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @CurrentUser() principal: Principal,
  ): Promise<WorkOrderResponseDto> {
    await this.rejectBudgetUseCase.execute(
      new RejectBudgetCommand(number, principal.userId, budgetId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  // work-orders:read is the route-level gate - every actor able to reach it holds it, so the
  // work order's existence is not a secret from them. WorkOrderCompletionAuthorizer narrows to
  // the assigned mechanic or an administrator inside the use case (design.md).
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
    await this.completeWorkOrderUseCase.execute(
      new CompleteWorkOrderCommand(number, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.deliverVehicleUseCase.execute(new DeliverVehicleCommand(number, principal.userId));
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
  }

  // work-orders:cancel is the route-level gate. CancellationAuthorizer additionally requires
  // work-orders:cancel-in-execution inside the use case when the work order carries an
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
    await this.cancelWorkOrderUseCase.execute(
      new CancelWorkOrderCommand(number, body.reason, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
    await this.applyDiscountUseCase.execute(
      new ApplyDiscountCommand(number, body.amountCents, body.note, principal.userId),
    );
    return this.toResponseDto(
      await this.getWorkOrderUseCase.execute(new GetWorkOrderQuery(number)),
    );
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
      statusLabel: workOrderStatusLabel(workOrder.status),
      customerName: workOrder.customerName,
      vehiclePlate: workOrder.vehiclePlate,
      vehicleBrand: workOrder.vehicleBrand,
      vehicleModel: workOrder.vehicleModel,
      vehicleYear: workOrder.vehicleYear,
      serviceItems: workOrder.serviceItems,
      partItems: workOrder.partItems,
      budgets: workOrder.budgets.map((budget) => this.toBudgetResponseDto(workOrder, budget)),
      chargedTotalCents: workOrder.chargedTotalCents,
      discountCents: workOrder.discountCents,
      discountNote: workOrder.discountNote,
      completedAt: workOrder.completedAt,
      deliveredAt: workOrder.deliveredAt,
      canceledAt: workOrder.canceledAt,
      cancellationReason: workOrder.cancellationReason,
    };
  }

  // The links go on the pending budget of a work order that awaits approval. A decided budget has
  // nothing left to decide, and a work order canceled while it awaited approval keeps its budget
  // pending, where a link could only be refused.
  private toBudgetResponseDto(
    workOrder: WorkOrderSummaryDto,
    budget: WorkOrderBudgetDto,
  ): WorkOrderBudgetResponseDto {
    const decidable =
      (workOrder.status as WorkOrderStatus) === WorkOrderStatus.AwaitingApproval &&
      (budget.status as BudgetStatus) === BudgetStatus.Pending;
    const links = decidable ? this.budgetLinks.of(workOrder.number, budget.id) : null;
    return {
      ...budget,
      approvalUrl: links?.approvalUrl ?? null,
      rejectionUrl: links?.rejectionUrl ?? null,
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
