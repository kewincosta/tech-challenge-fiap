export class StartDiagnosisCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
  ) {}
}
