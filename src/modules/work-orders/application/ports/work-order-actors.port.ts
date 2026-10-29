/** What an actor may do to work orders, decided from the permissions identity grants them. */
export interface ActorCapabilities {
  /** May approve or reject the budget of any work order, not only their own. */
  decidesAnyBudget: boolean;
  /** May cancel a work order that already withdrew parts. */
  cancelsInExecution: boolean;
  /** May manage every work order, completion included. */
  managesWorkOrders: boolean;
}

export interface WorkOrderActors {
  /** Every capability is false for a user that holds none and for one that does not exist. */
  capabilitiesOf(userId: string): Promise<ActorCapabilities>;
  /** `null` when there is no such user. */
  findMechanicCandidate(userId: string): Promise<{ isMechanic: boolean } | null>;
}
