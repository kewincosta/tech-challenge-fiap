export class UpdateServiceCommand {
  constructor(
    readonly serviceId: string,
    readonly name?: string,
    /** `null` clears the description; omitting the field leaves it untouched. */
    readonly description?: string | null,
    readonly priceCents?: number,
    readonly estimatedDurationMinutes?: number,
  ) {}
}
