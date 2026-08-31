export interface RefreshTokenHasher {
  hash(raw: string): string;
}

export const REFRESH_TOKEN_HASHER = Symbol('RefreshTokenHasher');
