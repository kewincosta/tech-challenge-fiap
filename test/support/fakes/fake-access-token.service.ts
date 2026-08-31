import {
  AccessTokenPayload,
  AccessTokenService,
  SignedAccessToken,
} from '../../../src/modules/authentication/application/ports/access-token.port';

export class FakeAccessTokenService implements AccessTokenService {
  async sign(payload: AccessTokenPayload): Promise<SignedAccessToken> {
    return Promise.resolve({
      token: `token:${payload.userId}:${payload.sessionId}`,
      expiresInSeconds: 900,
    });
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    const parts = token.split(':');
    if (parts.length !== 3 || parts[0] !== 'token') {
      return Promise.resolve(null);
    }
    return Promise.resolve({ userId: parts[1], sessionId: parts[2] });
  }
}
