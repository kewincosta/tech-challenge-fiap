import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../modules/identity';
import { CheckReadinessUseCase } from '../application/check-readiness.use-case';
import { LiveResponseDto, ReadinessResponseDto } from './dtos/health.response.dto';

// The cluster probes these two routes, so they answer with no token and outside the rate limit, and
// they sit outside the `api` prefix and the version of every other route (see `configureApp`).
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly checkReadiness: CheckReadinessUseCase) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is running and answering' })
  @ApiOkResponse({ type: LiveResponseDto })
  live(): LiveResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: the database and Redis answer within 2 seconds' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: ReadinessResponseDto })
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponseDto> {
    const report = await this.checkReadiness.execute();
    if (report.status === 'error') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
