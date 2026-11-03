import {
  ActorCapabilities,
  WorkOrderActors,
} from '../../../src/modules/work-orders/application/ports/work-order-actors.port';

const NO_CAPABILITIES: ActorCapabilities = {
  decidesAnyBudget: false,
  cancelsInExecution: false,
  managesWorkOrders: false,
};

export class FakeWorkOrderActors implements WorkOrderActors {
  private readonly capabilities = new Map<string, ActorCapabilities>();
  private readonly mechanicCandidates = new Map<string, { isMechanic: boolean }>();
  /** Every user id whose capabilities were asked for, in order. */
  readonly capabilityLookups: string[] = [];

  /** Seeds the capabilities of a user; the ones left out are false. */
  withCapabilities(userId: string, capabilities: Partial<ActorCapabilities>): this {
    this.capabilities.set(userId, { ...NO_CAPABILITIES, ...capabilities });
    return this;
  }

  /** Seeds an existing user, a mechanic or not. */
  withUser(userId: string, isMechanic: boolean): this {
    this.mechanicCandidates.set(userId, { isMechanic });
    return this;
  }

  async capabilitiesOf(userId: string): Promise<ActorCapabilities> {
    this.capabilityLookups.push(userId);
    return Promise.resolve(this.capabilities.get(userId) ?? NO_CAPABILITIES);
  }

  async findMechanicCandidate(userId: string): Promise<{ isMechanic: boolean } | null> {
    return Promise.resolve(this.mechanicCandidates.get(userId) ?? null);
  }
}
