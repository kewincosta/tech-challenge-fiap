export interface RefreshTokenHasher {
  hash(raw: string): string;
}
