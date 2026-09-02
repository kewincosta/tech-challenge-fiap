export class GetAverageExecutionTimeQuery {
  constructor(
    readonly serviceId?: string,
    readonly completedFrom?: Date,
    readonly completedTo?: Date,
  ) {}
}
