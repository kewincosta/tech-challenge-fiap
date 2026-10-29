/** What work orders read of a service: its name and price, which a work order snapshots. */
export interface ServiceRef {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export interface ServiceCatalog {
  /** A deactivated service is still found, with `active` false. `null` when there is none. */
  findById(serviceId: string): Promise<ServiceRef | null>;
}
