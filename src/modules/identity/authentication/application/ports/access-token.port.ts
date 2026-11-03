export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  mustChangePassword: boolean;
}

export interface SignedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export interface AccessTokenService {
  sign(payload: AccessTokenPayload): Promise<SignedAccessToken>;
  verify(token: string): Promise<AccessTokenPayload | null>;
}
