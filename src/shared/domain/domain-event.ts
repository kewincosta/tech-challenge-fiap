export abstract class DomainEvent {
  protected constructor(readonly occurredAt: Date) {}
}
