export interface UserSummaryDto {
  id: string;
  email: string;
  name: string;
  document: string;
  status: string;
}

export interface UserQueryPort {
  findActiveByDocument(document: string): Promise<UserSummaryDto | null>;
}

export const USER_QUERY_PORT = Symbol('UserQueryPort');
