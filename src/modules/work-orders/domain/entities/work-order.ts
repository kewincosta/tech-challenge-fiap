import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../budget-status';
import { BudgetedItemNotRemovableError } from '../errors/budgeted-item-not-removable.error';
import { DiagnosisWithoutItemsError } from '../errors/diagnosis-without-items.error';
import { DiscountExceedsChargedTotalError } from '../errors/discount-exceeds-charged-total.error';
import { DuplicateBatchLineError } from '../errors/duplicate-batch-line.error';
import { EmptyDraftBudgetError } from '../errors/empty-draft-budget.error';
import { PartNotWithdrawableError } from '../errors/part-not-withdrawable.error';
import { ReturnExceedsWithdrawnError } from '../errors/return-exceeds-withdrawn.error';
import { WithdrawalExceedsPlannedError } from '../errors/withdrawal-exceeds-planned.error';
import { WorkOrderItemNotFoundError } from '../errors/work-order-item-not-found.error';
import { WorkOrderStateError } from '../errors/work-order-state.error';
import { BudgetApproved } from '../events/budget-approved.event';
import { BudgetGenerated } from '../events/budget-generated.event';
import { BudgetRejected } from '../events/budget-rejected.event';
import { BudgetSent } from '../events/budget-sent.event';
import { DiagnosisCompleted } from '../events/diagnosis-completed.event';
import { DiagnosisStarted } from '../events/diagnosis-started.event';
import { DiscountApplied } from '../events/discount-applied.event';
import { ExecutionStarted } from '../events/execution-started.event';
import { ItemRemovedFromWorkOrder } from '../events/item-removed-from-work-order.event';
import { MechanicAssigned } from '../events/mechanic-assigned.event';
import { PartPlannedForWorkOrder } from '../events/part-planned-for-work-order.event';
import { PartReturned } from '../events/part-returned.event';
import { PartWithdrawn } from '../events/part-withdrawn.event';
import { ServiceAddedToWorkOrder } from '../events/service-added-to-work-order.event';
import { SupplementaryBudgetGenerated } from '../events/supplementary-budget-generated.event';
import { VehicleDelivered } from '../events/vehicle-delivered.event';
import { WorkOrderCompleted } from '../events/work-order-completed.event';
import { WorkOrderCreated } from '../events/work-order-created.event';
import { BudgetId } from '../value-objects/budget-id';
import { PlannedQuantity } from '../value-objects/planned-quantity';
import { WorkOrderId } from '../value-objects/work-order-id';
import { WorkOrderItemId } from '../value-objects/work-order-item-id';
import { WorkOrderNumber } from '../value-objects/work-order-number';
import { WorkOrderStatus } from '../work-order-status';
import { Budget } from './budget';
import { WorkOrderPartItem } from './work-order-part-item';
import { WorkOrderServiceItem } from './work-order-service-item';

/**
 * The closing figures, split out so `restore` can default them for a work order loaded before
 * this feature ever ran, without every existing `restore` call site in the codebase having to
 * name eleven fields no production row could have carried before this feature made `COMPLETED`,
 * `DELIVERED` and `CANCELED` reachable (design.md's Risks & Concerns).
 */
interface ClosingProps {
  chargedTotal: Money | null;
  discount: Money;
  discountNote: string | null;
  discountAppliedByUserId: string | null;
  discountAppliedAt: Date | null;
  completedAt: Date | null;
  deliveredAt: Date | null;
  deliveredByUserId: string | null;
  canceledAt: Date | null;
  canceledByUserId: string | null;
  cancellationReason: string | null;
}

const CLOSING_DEFAULTS: ClosingProps = {
  chargedTotal: null,
  discount: Money.fromCents(0),
  discountNote: null,
  discountAppliedByUserId: null,
  discountAppliedAt: null,
  completedAt: null,
  deliveredAt: null,
  deliveredByUserId: null,
  canceledAt: null,
  canceledByUserId: null,
  cancellationReason: null,
};

interface WorkOrderProps extends ClosingProps {
  id: WorkOrderId;
  number: WorkOrderNumber;
  customerId: string;
  vehicleId: string;
  assignedMechanicUserId: string | null;
  createdByUserId: string;
  status: WorkOrderStatus;
  customerName: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  createdAt: Date;
  updatedAt: Date;
  serviceItems: WorkOrderServiceItem[];
  partItems: WorkOrderPartItem[];
  diagnosisStartedAt: Date | null;
  diagnosisCompletedAt: Date | null;
  budgets: Budget[];
  budgetDecidedAt: Date | null;
  budgetDecidedByUserId: string | null;
  executionStartedAt: Date | null;
}

/** What `restore` accepts: every prop `WorkOrderProps` carries, except the closing figures may be
 * omitted and default to `CLOSING_DEFAULTS` - the shape every pre-existing row has. */
type RestoreWorkOrderProps = Omit<WorkOrderProps, keyof ClosingProps> & Partial<ClosingProps>;

interface OpenWorkOrderInput {
  id: WorkOrderId;
  number: WorkOrderNumber;
  customerId: string;
  vehicleId: string;
  createdByUserId: string;
  customerName: string;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  now: Date;
}

interface AddServiceInput {
  itemId: WorkOrderItemId;
  serviceId: string;
  serviceName: string;
  unitPrice: Money;
  actorUserId: string;
  now: Date;
}

interface PlanPartInput {
  itemId: WorkOrderItemId;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unitPrice: Money;
  plannedQuantity: PlannedQuantity;
  actorUserId: string;
  now: Date;
}

interface RemoveItemInput {
  itemId: WorkOrderItemId;
  actorUserId: string;
  now: Date;
}

interface AssignMechanicInput {
  mechanicUserId: string;
  actorUserId: string;
  now: Date;
}

interface StartDiagnosisInput {
  actorUserId: string;
  now: Date;
}

interface CompleteDiagnosisInput {
  budgetId: BudgetId;
  actorUserId: string;
  now: Date;
}

interface DecideBudgetActionInput {
  actorUserId: string;
  now: Date;
}

interface SubmitSupplementaryBudgetInput {
  budgetId: BudgetId;
  actorUserId: string;
  now: Date;
}

export interface BatchLine {
  itemId: WorkOrderItemId;
  quantity: number;
}

export interface ResolvedBatchLine {
  inventoryItemId: string;
  quantity: number;
}

interface WithdrawPartsInput {
  lines: BatchLine[];
  actorUserId: string;
  now: Date;
}

interface ApplyDiscountInput {
  amount: Money;
  note: string;
  actorUserId: string;
  now: Date;
}

interface CloseActionInput {
  actorUserId: string;
  now: Date;
}

/** `addService` and `removeItem` both allow this set - section 11's table. */
const ITEM_EDITABLE_STATES = [
  WorkOrderStatus.Received,
  WorkOrderStatus.InDiagnosis,
  WorkOrderStatus.InExecution,
];

/** `planPart` is narrower: parts are identified during the diagnosis, never at reception. */
const PART_PLANNABLE_STATES = [WorkOrderStatus.InDiagnosis, WorkOrderStatus.InExecution];

const MECHANIC_ASSIGNABLE_TERMINAL_STATES = [WorkOrderStatus.Delivered, WorkOrderStatus.Canceled];

/**
 * One visit, its snapshot, its items, and the events that describe what was done to it. The
 * trail is never loaded here - `restore` rebuilds the items but not the history, which is a read
 * model over `work_order_events` (T11).
 */
export class WorkOrder extends AggregateRoot {
  private constructor(private readonly props: WorkOrderProps) {
    super();
  }

  static open(input: OpenWorkOrderInput): WorkOrder {
    const workOrder = new WorkOrder({
      id: input.id,
      number: input.number,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      assignedMechanicUserId: null,
      createdByUserId: input.createdByUserId,
      status: WorkOrderStatus.Received,
      customerName: input.customerName,
      vehiclePlate: input.vehiclePlate,
      vehicleBrand: input.vehicleBrand,
      vehicleModel: input.vehicleModel,
      vehicleYear: input.vehicleYear,
      createdAt: input.now,
      updatedAt: input.now,
      serviceItems: [],
      partItems: [],
      diagnosisStartedAt: null,
      diagnosisCompletedAt: null,
      budgets: [],
      budgetDecidedAt: null,
      budgetDecidedByUserId: null,
      executionStartedAt: null,
      ...CLOSING_DEFAULTS,
    });
    workOrder.record(new WorkOrderCreated(input.id.value, input.createdByUserId, input.now));
    return workOrder;
  }

  static restore(props: RestoreWorkOrderProps): WorkOrder {
    return new WorkOrder({
      ...props,
      chargedTotal: props.chargedTotal ?? CLOSING_DEFAULTS.chargedTotal,
      discount: props.discount ?? CLOSING_DEFAULTS.discount,
      discountNote: props.discountNote ?? CLOSING_DEFAULTS.discountNote,
      discountAppliedByUserId: props.discountAppliedByUserId ?? CLOSING_DEFAULTS.discountAppliedByUserId,
      discountAppliedAt: props.discountAppliedAt ?? CLOSING_DEFAULTS.discountAppliedAt,
      completedAt: props.completedAt ?? CLOSING_DEFAULTS.completedAt,
      deliveredAt: props.deliveredAt ?? CLOSING_DEFAULTS.deliveredAt,
      deliveredByUserId: props.deliveredByUserId ?? CLOSING_DEFAULTS.deliveredByUserId,
      canceledAt: props.canceledAt ?? CLOSING_DEFAULTS.canceledAt,
      canceledByUserId: props.canceledByUserId ?? CLOSING_DEFAULTS.canceledByUserId,
      cancellationReason: props.cancellationReason ?? CLOSING_DEFAULTS.cancellationReason,
      serviceItems: [...props.serviceItems],
      partItems: [...props.partItems],
      budgets: [...props.budgets],
    });
  }

  addService(input: AddServiceInput): void {
    this.assertStateAllows(ITEM_EDITABLE_STATES);
    const item = WorkOrderServiceItem.add({
      id: input.itemId,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      unitPrice: input.unitPrice,
    });
    this.props.serviceItems.push(item);
    this.props.updatedAt = input.now;
    this.record(new ServiceAddedToWorkOrder(this.props.id.value, input.actorUserId, input.now));
  }

  planPart(input: PlanPartInput): void {
    this.assertStateAllows(PART_PLANNABLE_STATES);
    const item = WorkOrderPartItem.add({
      id: input.itemId,
      inventoryItemId: input.inventoryItemId,
      sku: input.sku,
      itemName: input.itemName,
      unitPrice: input.unitPrice,
      plannedQuantity: input.plannedQuantity,
    });
    this.props.partItems.push(item);
    this.props.updatedAt = input.now;
    this.record(new PartPlannedForWorkOrder(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * Refuses an item already attached to a budget round, whichever round and whichever state -
   * once quoted, an item is locked in (T6's regeneration-in-place comment). Only a draft item can
   * be removed.
   */
  removeItem(input: RemoveItemInput): void {
    this.assertStateAllows(ITEM_EDITABLE_STATES);
    const serviceIndex = this.props.serviceItems.findIndex((item) => item.id.equals(input.itemId));
    if (serviceIndex >= 0) {
      if (!this.props.serviceItems[serviceIndex].isDraft) {
        throw new BudgetedItemNotRemovableError();
      }
      this.props.serviceItems.splice(serviceIndex, 1);
    } else {
      const partIndex = this.props.partItems.findIndex((item) => item.id.equals(input.itemId));
      if (partIndex < 0) {
        throw new WorkOrderItemNotFoundError();
      }
      if (!this.props.partItems[partIndex].isDraft) {
        throw new BudgetedItemNotRemovableError();
      }
      this.props.partItems.splice(partIndex, 1);
    }
    this.props.updatedAt = input.now;
    this.record(new ItemRemovedFromWorkOrder(this.props.id.value, input.actorUserId, input.now));
  }

  startDiagnosis(input: StartDiagnosisInput): void {
    this.assertStateAllows([WorkOrderStatus.Received]);
    this.props.status = WorkOrderStatus.InDiagnosis;
    this.props.diagnosisStartedAt = input.now;
    if (this.props.assignedMechanicUserId === null) {
      this.props.assignedMechanicUserId = input.actorUserId;
    }
    this.props.updatedAt = input.now;
    this.record(new DiagnosisStarted(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * Guards `IN_DIAGNOSIS`, generates round one over every item eligible for it (drafts, plus - on
   * a regeneration after a rejection - the items already attached to round one), and moves to
   * `AWAITING_APPROVAL`. Regenerates the existing round one in place rather than opening round two
   * when one already exists (spec.md's first Assumption), which is also why `removeItem` refuses
   * a budgeted item even back in `IN_DIAGNOSIS`: the round's items are locked in once quoted.
   */
  completeDiagnosis(input: CompleteDiagnosisInput): void {
    this.assertStateAllows([WorkOrderStatus.InDiagnosis]);
    if (!this.hasItemsForRound(1)) {
      throw new DiagnosisWithoutItemsError();
    }
    const total = this.generateRound(1);
    const existingRoundOne = this.props.budgets.find((budget) => budget.round === 1);
    if (existingRoundOne) {
      existingRoundOne.regenerate({ total, generatedAt: input.now });
    } else {
      this.props.budgets.push(
        Budget.generate({ id: input.budgetId, round: 1, total, generatedAt: input.now }),
      );
    }
    this.props.status = WorkOrderStatus.AwaitingApproval;
    this.props.diagnosisCompletedAt = input.now;
    this.props.updatedAt = input.now;
    this.record(new DiagnosisCompleted(this.props.id.value, input.actorUserId, input.now));
    this.record(new BudgetGenerated(this.props.id.value, input.actorUserId, input.now));
    this.record(new BudgetSent(this.props.id.value, input.actorUserId, input.now));
  }

  /** True when at least one item is either a draft or already attached to `round`. */
  private hasItemsForRound(round: number): boolean {
    return (
      this.props.serviceItems.some((item) => item.isDraft || item.budgetRound === round) ||
      this.props.partItems.some((item) => item.isDraft || item.budgetRound === round)
    );
  }

  /**
   * Sums and attaches every item eligible for `round` - no I/O, no price supplied by any caller
   * (rule 29 held by construction). A part contributes its budgeted price times its planned
   * quantity; a service contributes its price once, carrying no quantity.
   */
  private generateRound(round: number): Money {
    let total = Money.fromCents(0);
    for (const item of this.props.serviceItems) {
      if (item.isDraft || item.budgetRound === round) {
        total = total.add(item.unitPrice);
        item.attachToBudget(round);
      }
    }
    for (const item of this.props.partItems) {
      if (item.isDraft || item.budgetRound === round) {
        total = total.add(item.unitPrice.multiply(item.plannedQuantity.units));
        item.attachToBudget(round);
      }
    }
    return total;
  }

  /**
   * Services on approved rounds, plus each part item's withdrawn quantity at its budgeted unit
   * price - rule 33's charged total, before the discount. An item on a rejected round or on no
   * round at all contributes nothing, and a part never withdrawn contributes nothing even if its
   * round was approved (phase 12's own test list: "not charge a planned part that was never
   * withdrawn"). Shared by `complete`, which freezes it, and `applyDiscount`, which validates
   * against it.
   */
  private chargedTotalBeforeDiscount(): Money {
    const approvedRounds = new Set(
      this.props.budgets
        .filter((budget) => budget.status === BudgetStatus.Approved)
        .map((budget) => budget.round),
    );
    let total = Money.fromCents(0);
    for (const item of this.props.serviceItems) {
      if (item.budgetedUnitPrice && item.budgetRound !== null && approvedRounds.has(item.budgetRound)) {
        total = total.add(item.budgetedUnitPrice);
      }
    }
    for (const item of this.props.partItems) {
      if (item.budgetedUnitPrice && item.budgetRound !== null && approvedRounds.has(item.budgetRound)) {
        total = total.add(item.budgetedUnitPrice.multiply(item.withdrawnQuantity));
      }
    }
    return total;
  }

  /**
   * Approves the pending round, moves to `IN_EXECUTION`, and sets `executionStartedAt` only the
   * first time - a later round returning the work order to execution is not a new execution
   * (section 9's invariants).
   */
  approveBudget(input: DecideBudgetActionInput): void {
    this.assertStateAllows([WorkOrderStatus.AwaitingApproval]);
    const budget = this.pendingBudget();
    budget.approve({ actorUserId: input.actorUserId, at: input.now });
    this.props.status = WorkOrderStatus.InExecution;
    this.props.budgetDecidedAt = input.now;
    this.props.budgetDecidedByUserId = input.actorUserId;
    if (this.props.executionStartedAt === null) {
      this.props.executionStartedAt = input.now;
    }
    this.props.updatedAt = input.now;
    this.record(new BudgetApproved(this.props.id.value, input.actorUserId, input.now));
    this.record(new ExecutionStarted(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * Round one returns the work order to `IN_DIAGNOSIS`. Any later round returns it to
   * `IN_EXECUTION` and records `ExecutionStarted` too - the trail's record of every entry into
   * execution, distinct from `executionStartedAt`, which stays at its first value (H38).
   */
  rejectBudget(input: DecideBudgetActionInput): void {
    this.assertStateAllows([WorkOrderStatus.AwaitingApproval]);
    const budget = this.pendingBudget();
    budget.reject({ actorUserId: input.actorUserId, at: input.now });
    const destination =
      budget.round === 1 ? WorkOrderStatus.InDiagnosis : WorkOrderStatus.InExecution;
    this.props.status = destination;
    this.props.budgetDecidedAt = input.now;
    this.props.budgetDecidedByUserId = input.actorUserId;
    this.props.updatedAt = input.now;
    this.record(new BudgetRejected(this.props.id.value, input.actorUserId, destination, input.now));
    if (destination === WorkOrderStatus.InExecution) {
      this.record(new ExecutionStarted(this.props.id.value, input.actorUserId, input.now));
    }
  }

  /**
   * Guards `IN_EXECUTION`, generates the next round over the draft items only (no round-N items
   * to fold back in, unlike `completeDiagnosis`'s regeneration case - `generateRound`'s
   * `budgetRound === round` clause is a no-op for a brand new round number), and moves to
   * `AWAITING_APPROVAL`.
   */
  submitSupplementaryBudget(input: SubmitSupplementaryBudgetInput): void {
    this.assertStateAllows([WorkOrderStatus.InExecution]);
    const nextRound = this.props.budgets.reduce((max, budget) => Math.max(max, budget.round), 0) + 1;
    if (!this.hasItemsForRound(nextRound)) {
      throw new EmptyDraftBudgetError();
    }
    const total = this.generateRound(nextRound);
    this.props.budgets.push(
      Budget.generate({ id: input.budgetId, round: nextRound, total, generatedAt: input.now }),
    );
    this.props.status = WorkOrderStatus.AwaitingApproval;
    this.props.updatedAt = input.now;
    this.record(
      new SupplementaryBudgetGenerated(this.props.id.value, input.actorUserId, input.now),
    );
    this.record(new BudgetSent(this.props.id.value, input.actorUserId, input.now));
  }

  private pendingBudget(): Budget {
    const budget = this.props.budgets.find((candidate) => candidate.status === BudgetStatus.Pending);
    if (!budget) {
      throw new WorkOrderStateError(this.props.status);
    }
    return budget;
  }

  /**
   * Validates the whole batch before touching anything - every line is checked, then every line
   * is applied, so a guard firing on line three leaves lines one and two untouched too (design.md's
   * Risks & Concerns). Returns the resolved lines because the handler needs each work order
   * item's inventory item id to dispatch the cross-module consumption command; this aggregate is
   * the only thing that holds that mapping.
   */
  withdrawParts(input: WithdrawPartsInput): ResolvedBatchLine[] {
    this.assertStateAllows([WorkOrderStatus.InExecution]);
    this.assertNoDuplicateLines(input.lines);
    const resolved = input.lines.map((line) => {
      const item = this.props.partItems.find((candidate) => candidate.id.equals(line.itemId));
      if (!item) {
        throw new WorkOrderItemNotFoundError();
      }
      this.assertWithdrawable(item, line.quantity);
      return { item, quantity: line.quantity };
    });
    for (const { item, quantity } of resolved) {
      item.withdraw(quantity);
    }
    this.props.updatedAt = input.now;
    this.record(new PartWithdrawn(this.props.id.value, input.actorUserId, input.now));
    return resolved.map(({ item, quantity }) => ({
      inventoryItemId: item.inventoryItemId,
      quantity,
    }));
  }

  /**
   * Same validate-everything-then-apply-everything shape as `withdrawParts`. Carries no round
   * guard - a return only ever lowers what was already withdrawn, regardless of the round's
   * status.
   */
  returnParts(input: WithdrawPartsInput): ResolvedBatchLine[] {
    this.assertStateAllows([WorkOrderStatus.InExecution]);
    this.assertNoDuplicateLines(input.lines);
    const resolved = input.lines.map((line) => {
      const item = this.props.partItems.find((candidate) => candidate.id.equals(line.itemId));
      if (!item) {
        throw new WorkOrderItemNotFoundError();
      }
      if (item.withdrawnQuantity - line.quantity < 0) {
        throw new ReturnExceedsWithdrawnError();
      }
      return { item, quantity: line.quantity };
    });
    for (const { item, quantity } of resolved) {
      item.returnUnits(quantity);
    }
    this.props.updatedAt = input.now;
    this.record(new PartReturned(this.props.id.value, input.actorUserId, input.now));
    return resolved.map(({ item, quantity }) => ({
      inventoryItemId: item.inventoryItemId,
      quantity,
    }));
  }

  /** Only an item attached to an `APPROVED` round can be withdrawn - a draft or a pending round
   * both leave it on the shelf (H38, spec.md's Assumptions). */
  private assertWithdrawable(item: WorkOrderPartItem, quantity: number): void {
    if (item.budgetRound === null) {
      throw new PartNotWithdrawableError();
    }
    const budget = this.props.budgets.find((candidate) => candidate.round === item.budgetRound);
    if (!budget || budget.status !== BudgetStatus.Approved) {
      throw new PartNotWithdrawableError();
    }
    if (item.withdrawnQuantity + quantity > item.plannedQuantity.units) {
      throw new WithdrawalExceedsPlannedError();
    }
  }

  private assertNoDuplicateLines(lines: BatchLine[]): void {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.itemId.value)) {
        throw new DuplicateBatchLineError();
      }
      seen.add(line.itemId.value);
    }
  }

  assignMechanic(input: AssignMechanicInput): void {
    if (MECHANIC_ASSIGNABLE_TERMINAL_STATES.includes(this.props.status)) {
      throw new WorkOrderStateError(this.props.status);
    }
    this.props.assignedMechanicUserId = input.mechanicUserId;
    this.props.updatedAt = input.now;
    this.record(new MechanicAssigned(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * A second call replaces the first outright - the columns phase 12 defines are singular, one
   * amount, one note, one author, one moment (spec.md's Assumptions). Recomputes and persists
   * `chargedTotal` when already `COMPLETED`, since that figure was already frozen and this is the
   * only other write that can change it (rule 33).
   */
  applyDiscount(input: ApplyDiscountInput): void {
    this.assertStateAllows([WorkOrderStatus.InExecution, WorkOrderStatus.Completed]);
    const preDiscountTotal = this.chargedTotalBeforeDiscount();
    if (input.amount.isGreaterThan(preDiscountTotal)) {
      throw new DiscountExceedsChargedTotalError();
    }
    this.props.discount = input.amount;
    this.props.discountNote = input.note;
    this.props.discountAppliedByUserId = input.actorUserId;
    this.props.discountAppliedAt = input.now;
    if (this.props.status === WorkOrderStatus.Completed) {
      this.props.chargedTotal = preDiscountTotal.subtract(input.amount);
    }
    this.props.updatedAt = input.now;
    this.record(new DiscountApplied(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * Freezes the charged total for good - the only other write that can touch it afterwards is
   * `applyDiscount`, which recomputes it explicitly for a `COMPLETED` work order. Revalidates the
   * discount against the current pre-discount total rather than trusting the value
   * `applyDiscount` already checked: a return between the discount and the completion can have
   * lowered the total since (spec.md edge case, L-008 - `applyDiscount`'s own check cannot see a
   * later return).
   */
  complete(input: CloseActionInput): void {
    this.assertStateAllows([WorkOrderStatus.InExecution]);
    const preDiscountTotal = this.chargedTotalBeforeDiscount();
    if (this.props.discount.isGreaterThan(preDiscountTotal)) {
      throw new DiscountExceedsChargedTotalError();
    }
    this.props.chargedTotal = preDiscountTotal.subtract(this.props.discount);
    this.props.status = WorkOrderStatus.Completed;
    this.props.completedAt = input.now;
    this.props.updatedAt = input.now;
    this.record(new WorkOrderCompleted(this.props.id.value, input.actorUserId, input.now));
  }

  /**
   * Only records who took the handover and when - `chargedTotal` was already frozen by
   * `complete` and is untouched here. Settling the pending consumptions is
   * `SettleStockMovementsHandler`'s job, inside the same transaction (T12, T17).
   */
  deliver(input: CloseActionInput): void {
    this.assertStateAllows([WorkOrderStatus.Completed]);
    this.props.status = WorkOrderStatus.Delivered;
    this.props.deliveredAt = input.now;
    this.props.deliveredByUserId = input.actorUserId;
    this.props.updatedAt = input.now;
    this.record(new VehicleDelivered(this.props.id.value, input.actorUserId, input.now));
  }

  private assertStateAllows(allowed: WorkOrderStatus[]): void {
    if (!allowed.includes(this.props.status)) {
      throw new WorkOrderStateError(this.props.status);
    }
  }

  get id(): WorkOrderId {
    return this.props.id;
  }

  get number(): WorkOrderNumber {
    return this.props.number;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get vehicleId(): string {
    return this.props.vehicleId;
  }

  get assignedMechanicUserId(): string | null {
    return this.props.assignedMechanicUserId;
  }

  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  get status(): WorkOrderStatus {
    return this.props.status;
  }

  get customerName(): string {
    return this.props.customerName;
  }

  get vehiclePlate(): string {
    return this.props.vehiclePlate;
  }

  get vehicleBrand(): string {
    return this.props.vehicleBrand;
  }

  get vehicleModel(): string {
    return this.props.vehicleModel;
  }

  get vehicleYear(): number {
    return this.props.vehicleYear;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get serviceItems(): readonly WorkOrderServiceItem[] {
    return [...this.props.serviceItems];
  }

  get partItems(): readonly WorkOrderPartItem[] {
    return [...this.props.partItems];
  }

  get diagnosisStartedAt(): Date | null {
    return this.props.diagnosisStartedAt;
  }

  get diagnosisCompletedAt(): Date | null {
    return this.props.diagnosisCompletedAt;
  }

  get budgets(): readonly Budget[] {
    return [...this.props.budgets];
  }

  get budgetDecidedAt(): Date | null {
    return this.props.budgetDecidedAt;
  }

  get budgetDecidedByUserId(): string | null {
    return this.props.budgetDecidedByUserId;
  }

  get executionStartedAt(): Date | null {
    return this.props.executionStartedAt;
  }

  get chargedTotal(): Money | null {
    return this.props.chargedTotal;
  }

  get discount(): Money {
    return this.props.discount;
  }

  get discountNote(): string | null {
    return this.props.discountNote;
  }

  get discountAppliedByUserId(): string | null {
    return this.props.discountAppliedByUserId;
  }

  get discountAppliedAt(): Date | null {
    return this.props.discountAppliedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get deliveredAt(): Date | null {
    return this.props.deliveredAt;
  }

  get deliveredByUserId(): string | null {
    return this.props.deliveredByUserId;
  }

  get canceledAt(): Date | null {
    return this.props.canceledAt;
  }

  get canceledByUserId(): string | null {
    return this.props.canceledByUserId;
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason;
  }

  /** What `CancellationAuthorizer` reads: any part item withdrawn at all, in any state. */
  get hasOutstandingWithdrawals(): boolean {
    return this.props.partItems.some((item) => item.withdrawnQuantity > 0);
  }
}
