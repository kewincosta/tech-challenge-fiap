export class ApproveBudgetCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
  ) {}
}
