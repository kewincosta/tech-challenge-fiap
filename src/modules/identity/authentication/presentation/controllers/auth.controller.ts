import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { authThrottle } from '../../../../../config/rate-limit.config';
import { ErrorResponseDto } from '../../../../../shared/presentation/dtos/error-response.dto';
import { AuthenticateUserCommand } from '../../application/commands/authenticate-user/authenticate-user.command';
import { AuthenticateUserUseCase } from '../../application/commands/authenticate-user/authenticate-user.use-case';
import { LogoutAllSessionsCommand } from '../../application/commands/logout-all-sessions/logout-all-sessions.command';
import { LogoutAllSessionsUseCase } from '../../application/commands/logout-all-sessions/logout-all-sessions.use-case';
import { RefreshSessionCommand } from '../../application/commands/refresh-session/refresh-session.command';
import { RefreshSessionUseCase } from '../../application/commands/refresh-session/refresh-session.use-case';
import { RevokeSessionCommand } from '../../application/commands/revoke-session/revoke-session.command';
import { RevokeSessionUseCase } from '../../application/commands/revoke-session/revoke-session.use-case';
import { ListUserSessionsUseCase } from '../../application/queries/list-user-sessions/list-user-sessions.use-case';
import { ListUserSessionsQuery } from '../../application/queries/list-user-sessions/list-user-sessions.query';
import { AllowsPendingPassword } from '../decorators/allows-pending-password.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Principal } from '../principal';
import { AuthResponseDto } from '../dtos/auth.response.dto';
import { LoginRequestDto } from '../dtos/login.request.dto';
import { RefreshTokenRequestDto } from '../dtos/refresh-token.request.dto';
import { LogoutAllResponseDto, SessionResponseDto } from '../dtos/session.response.dto';

const USER_AGENT_MAX_LENGTH = 512;

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutAllSessions: LogoutAllSessionsUseCase,
    private readonly revokeUserSession: RevokeSessionUseCase,
    private readonly listUserSessions: ListUserSessionsUseCase,
  ) {}

  @Public()
  @Throttle({ default: authThrottle() })
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Login: create a session and issue an access and refresh token pair' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async login(@Body() body: LoginRequestDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.authenticateUser.execute(
      new AuthenticateUserCommand(
        body.email,
        body.password,
        request.ip ?? null,
        this.userAgentOf(request),
      ),
    );
  }

  @Public()
  @Throttle({ default: authThrottle() })
  @Post('tokens')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Refresh: rotate the refresh token and issue a new token pair' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async refresh(@Body() body: RefreshTokenRequestDto): Promise<AuthResponseDto> {
    return this.refreshSession.execute(new RefreshSessionCommand(body.refreshToken));
  }

  @Delete('sessions')
  @AllowsPendingPassword()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout: revoke every active session of the authenticated user' })
  @ApiOkResponse({ type: LogoutAllResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async logout(@CurrentUser() principal: Principal): Promise<LogoutAllResponseDto> {
    return this.logoutAllSessions.execute(new LogoutAllSessionsCommand(principal.userId));
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the active sessions of the authenticated user' })
  @ApiOkResponse({ type: [SessionResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listSessions(@CurrentUser() principal: Principal): Promise<SessionResponseDto[]> {
    const sessions = await this.listUserSessions.execute(
      new ListUserSessionsQuery(principal.userId),
    );
    return sessions.map((session) => ({
      ...session,
      current: session.id === principal.sessionId,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session by id (owner or sessions:revoke-any permission)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.revokeUserSession.execute(new RevokeSessionCommand(id, principal.userId));
  }

  private userAgentOf(request: Request): string | null {
    const userAgent = request.headers['user-agent'];
    if (typeof userAgent !== 'string' || userAgent.length === 0) {
      return null;
    }
    return userAgent.slice(0, USER_AGENT_MAX_LENGTH);
  }
}
