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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../shared/presentation/dtos/error-response.dto';
import { AppPermission, CurrentUser, Principal, RequirePermissions } from '../../../identity';
import { AdjustStockCommand } from '../../application/commands/adjust-stock/adjust-stock.command';
import { AdjustStockHandler } from '../../application/commands/adjust-stock/adjust-stock.handler';
import { CreateInventoryItemCommand } from '../../application/commands/create-inventory-item/create-inventory-item.command';
import { CreateInventoryItemHandler } from '../../application/commands/create-inventory-item/create-inventory-item.handler';
import { DeactivateInventoryItemCommand } from '../../application/commands/deactivate-inventory-item/deactivate-inventory-item.command';
import { DeactivateInventoryItemHandler } from '../../application/commands/deactivate-inventory-item/deactivate-inventory-item.handler';
import { ReplenishStockCommand } from '../../application/commands/replenish-stock/replenish-stock.command';
import { ReplenishStockHandler } from '../../application/commands/replenish-stock/replenish-stock.handler';
import { UpdateInventoryItemCommand } from '../../application/commands/update-inventory-item/update-inventory-item.command';
import { UpdateInventoryItemHandler } from '../../application/commands/update-inventory-item/update-inventory-item.handler';
import {
  InventoryItemSummaryDto,
  StockMovementSummaryDto,
  StockShortageDto,
} from '../../application/ports/inventory-query.port';
import { GetInventoryItemHandler } from '../../application/queries/get-inventory-item/get-inventory-item.handler';
import { GetInventoryItemQuery } from '../../application/queries/get-inventory-item/get-inventory-item.query';
import { GetItemMovementHistoryHandler } from '../../application/queries/get-item-movement-history/get-item-movement-history.handler';
import { GetItemMovementHistoryQuery } from '../../application/queries/get-item-movement-history/get-item-movement-history.query';
import { ListInventoryItemsHandler } from '../../application/queries/list-inventory-items/list-inventory-items.handler';
import { ListInventoryItemsQuery } from '../../application/queries/list-inventory-items/list-inventory-items.query';
import { ListStockShortagesHandler } from '../../application/queries/list-stock-shortages/list-stock-shortages.handler';
import { ListStockShortagesQuery } from '../../application/queries/list-stock-shortages/list-stock-shortages.query';
import { AdjustStockRequestDto } from '../dtos/adjust-stock.request.dto';
import { CreateInventoryItemRequestDto } from '../dtos/create-inventory-item.request.dto';
import {
  CreatedInventoryItemResponseDto,
  InventoryItemResponseDto,
  StockMovementResponseDto,
  StockShortageResponseDto,
} from '../dtos/inventory-item.response.dto';
import { ReplenishStockRequestDto } from '../dtos/replenish-stock.request.dto';
import { UpdateInventoryItemRequestDto } from '../dtos/update-inventory-item.request.dto';

@ApiTags('inventory-items')
@Controller('inventory-items')
export class InventoryItemsController {
  constructor(
    private readonly createItem: CreateInventoryItemHandler,
    private readonly updateItem: UpdateInventoryItemHandler,
    private readonly deactivateItem: DeactivateInventoryItemHandler,
    private readonly replenishStock: ReplenishStockHandler,
    private readonly adjustStock: AdjustStockHandler,
    private readonly getItem: GetInventoryItemHandler,
    private readonly listItems: ListInventoryItemsHandler,
    private readonly listShortages: ListStockShortagesHandler,
    private readonly getMovementHistory: GetItemMovementHistoryHandler,
  ) {}

  @Post()
  @RequirePermissions(AppPermission.InventoryManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a catalog item' })
  @ApiCreatedResponse({ type: CreatedInventoryItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async create(
    @Body() body: CreateInventoryItemRequestDto,
  ): Promise<CreatedInventoryItemResponseDto> {
    return this.createItem.execute(
      new CreateInventoryItemCommand(
        body.sku,
        body.name,
        body.kind,
        body.unitPriceCents,
        body.description,
      ),
    );
  }

  @Get()
  @RequirePermissions(AppPermission.InventoryRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the active catalog, filtered by kind' })
  @ApiQuery({ name: 'kind', required: false, enum: ['PART', 'SUPPLY'] })
  @ApiOkResponse({ type: [InventoryItemResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async list(@Query('kind') kind?: string): Promise<InventoryItemResponseDto[]> {
    const items = await this.listItems.execute(new ListInventoryItemsQuery(kind));
    return items.map((item) => this.toItemResponseDto(item));
  }

  // Declared above `:externalId` on purpose: Nest matches routes in registration order, and
  // `:externalId` carries a `ParseUUIDPipe` that would otherwise try to parse the literal
  // "shortages" as a uuid and answer 400 instead of running this handler (design.md's Risks).
  @Get('shortages')
  @RequirePermissions(AppPermission.InventoryRead)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List items whose demand from work orders in execution exceeds the shelf',
  })
  @ApiOkResponse({ type: [StockShortageResponseDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async shortages(): Promise<StockShortageResponseDto[]> {
    const shortages = await this.listShortages.execute(new ListStockShortagesQuery());
    return shortages.map((shortage) => this.toShortageResponseDto(shortage));
  }

  @Get(':externalId')
  @RequirePermissions(AppPermission.InventoryRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a catalog item by id' })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async getById(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<InventoryItemResponseDto> {
    return this.toItemResponseDto(
      await this.getItem.execute(new GetInventoryItemQuery(externalId)),
    );
  }

  @Patch(':externalId')
  @RequirePermissions(AppPermission.InventoryManage)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update an item's name, description or unit price" })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async update(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: UpdateInventoryItemRequestDto,
  ): Promise<InventoryItemResponseDto> {
    await this.updateItem.execute(
      new UpdateInventoryItemCommand(externalId, body.name, body.description, body.unitPriceCents),
    );
    return this.toItemResponseDto(
      await this.getItem.execute(new GetInventoryItemQuery(externalId)),
    );
  }

  @Delete(':externalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AppPermission.InventoryManage)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Deactivate a catalog item (the record and its movement history are kept)',
    description:
      'Refused with 409 while any work order that planned the item has not been delivered or ' +
      'canceled. The quantity on hand is left untouched - only a movement moves the count.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async deactivate(@Param('externalId', ParseUUIDPipe) externalId: string): Promise<void> {
    await this.deactivateItem.execute(new DeactivateInventoryItemCommand(externalId));
  }

  @Post(':externalId/replenishments')
  @RequirePermissions(AppPermission.InventoryManage)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replenish an item, raising its quantity on hand' })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async replenish(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: ReplenishStockRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<InventoryItemResponseDto> {
    await this.replenishStock.execute(
      new ReplenishStockCommand(
        externalId,
        body.quantity,
        body.unitPriceCents,
        principal.userId,
        body.note,
      ),
    );
    return this.toItemResponseDto(
      await this.getItem.execute(new GetInventoryItemQuery(externalId)),
    );
  }

  @Post(':externalId/adjustments')
  @RequirePermissions(AppPermission.InventoryManage)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjust an item down, lowering its quantity on hand' })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async adjust(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() body: AdjustStockRequestDto,
    @CurrentUser() principal: Principal,
  ): Promise<InventoryItemResponseDto> {
    // body.note defaults to '' rather than being left undefined: AdjustStockCommand carries a
    // plain string, and a blank one is exactly what the aggregate's own note-required check is
    // for (design.md's Error Handling - the rule lives in one place, not duplicated at this DTO).
    await this.adjustStock.execute(
      new AdjustStockCommand(externalId, body.quantity, principal.userId, body.note ?? ''),
    );
    return this.toItemResponseDto(
      await this.getItem.execute(new GetInventoryItemQuery(externalId)),
    );
  }

  @Get(':externalId/movements')
  @RequirePermissions(AppPermission.AuditRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read an item's movement history, in chronological order" })
  @ApiOkResponse({ type: [StockMovementResponseDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  async movements(
    @Param('externalId', ParseUUIDPipe) externalId: string,
  ): Promise<StockMovementResponseDto[]> {
    const movements = await this.getMovementHistory.execute(
      new GetItemMovementHistoryQuery(externalId),
    );
    return movements.map((movement) => this.toMovementResponseDto(movement));
  }

  private toItemResponseDto(item: InventoryItemSummaryDto): InventoryItemResponseDto {
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      kind: item.kind,
      unitPriceCents: item.unitPriceCents,
      quantityOnHand: item.quantityOnHand,
      status: item.status,
    };
  }

  private toShortageResponseDto(shortage: StockShortageDto): StockShortageResponseDto {
    return {
      inventoryItemId: shortage.inventoryItemId,
      sku: shortage.sku,
      name: shortage.name,
      quantityOnHand: shortage.quantityOnHand,
      outstandingQuantity: shortage.outstandingQuantity,
      workOrderNumbers: shortage.workOrderNumbers,
    };
  }

  private toMovementResponseDto(movement: StockMovementSummaryDto): StockMovementResponseDto {
    return {
      id: movement.id,
      kind: movement.kind,
      quantity: movement.quantity,
      unitPriceCents: movement.unitPriceCents,
      actorUserId: movement.actorUserId,
      note: movement.note,
      occurredAt: movement.occurredAt,
      status: movement.status,
      workOrderId: movement.workOrderId,
      undoesMovementId: movement.undoesMovementId,
    };
  }
}
