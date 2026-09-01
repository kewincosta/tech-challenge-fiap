export class AddRequestedServiceCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly serviceId: string,
    readonly actorUserId: string,
  ) {}
}
