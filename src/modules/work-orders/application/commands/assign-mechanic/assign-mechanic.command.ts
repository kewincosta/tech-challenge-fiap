export class AssignMechanicCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly mechanicUserId: string,
    readonly actorUserId: string,
  ) {}
}
