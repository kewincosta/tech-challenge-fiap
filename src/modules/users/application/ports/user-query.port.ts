export interface UserSummaryDto {
  id: string;
  email: string;
  name: string;
  document: string;
  status: string;
}

export interface ListUsersFilter {
  role?: string;
  document?: string;
}

export interface UserQueryPort {
  findActiveByDocument(document: string): Promise<UserSummaryDto | null>;
  listActive(filter: ListUsersFilter): Promise<UserSummaryDto[]>;
}

export const USER_QUERY_PORT = Symbol('UserQueryPort');
