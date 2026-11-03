export class ApproveBudgetCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
    /** The budget a link names. Left out, the pending round is approved. */
    readonly budgetId?: string,
    /** The hash the link carried. A command that names a budget has to carry the current one. */
    readonly link?: string,
  ) {}
}
