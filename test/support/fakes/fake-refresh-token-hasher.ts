import { RefreshTokenHasher } from '../../../src/modules/authentication/application/ports/refresh-token-hasher.port';

export class FakeRefreshTokenHasher implements RefreshTokenHasher {
  hash(raw: string): string {
    return `hash(${raw})`;
  }
}
