export class CompleteDiagnosisCommand {
  constructor(
    readonly workOrderNumber: string,
    readonly actorUserId: string,
  ) {}
}
