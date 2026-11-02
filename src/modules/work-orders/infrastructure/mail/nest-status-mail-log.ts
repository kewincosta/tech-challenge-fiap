import { Injectable, Logger } from '@nestjs/common';
import { StatusMailLog } from '../../application/ports/status-mail-log.port';

@Injectable()
export class NestStatusMailLog implements StatusMailLog {
  private readonly logger = new Logger('StatusMail');

  failed(workOrderNumber: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `The status e-mail of work order ${workOrderNumber} was not sent: ${reason}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}
