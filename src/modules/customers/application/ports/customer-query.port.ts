export interface CustomerAddressDto {
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface CustomerSummaryDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  document: string;
  address: CustomerAddressDto | null;
  phoneNumber: string | null;
  status: string;
}

export interface ListCustomersFilter {
  name?: string;
  document?: string;
}

export interface CustomerQueryPort {
  getById(externalId: string): Promise<CustomerSummaryDto | null>;
  getByUserId(userExternalId: string): Promise<CustomerSummaryDto | null>;
  listActive(filter: ListCustomersFilter): Promise<CustomerSummaryDto[]>;
}

export const CUSTOMER_QUERY_PORT = Symbol('CustomerQueryPort');
