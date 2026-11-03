export interface AuthResultDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}
