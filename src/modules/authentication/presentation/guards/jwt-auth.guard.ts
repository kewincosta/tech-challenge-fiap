import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  ACCESS_TOKEN_SERVICE,
  AccessTokenService,
} from '../../application/ports/access-token.port';
import {
  REVOKED_SESSION_STORE,
  RevokedSessionStore,
} from '../../application/ports/revoked-session-store.port';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Principal } from '../principal';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(REVOKED_SESSION_STORE) private readonly revokedSessions: RevokedSessionStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    const payload = await this.accessTokens.verify(token);
    if (!payload) {
      throw new UnauthorizedException();
    }
    if (await this.revokedSessions.isRevoked(payload.sessionId)) {
      throw new UnauthorizedException();
    }
    request.principal = {
      userId: payload.userId,
      sessionId: payload.sessionId,
      mustChangePassword: payload.mustChangePassword,
    };
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
