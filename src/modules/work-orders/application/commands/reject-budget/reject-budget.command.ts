export class RejectBudgetCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
  ) {}
}
