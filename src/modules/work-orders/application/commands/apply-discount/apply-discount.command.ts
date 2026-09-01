export class ApplyDiscountCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly amountCents: number,
    readonly note: string,
    readonly actorUserId: string,
  ) {}
}
