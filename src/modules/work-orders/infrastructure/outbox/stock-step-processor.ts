import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OutboxSettings } from '../../application/outbox-settings';
import { StockStepApplier } from '../../application/services/stock-step-applier';
import { OUTBOX_SETTINGS } from '../../work-orders.tokens';

/**
 * Looks for due stock steps when the application starts and then every `pollIntervalMs`, and hands
 * them to the applier. An interval of 0 turns it off: no run at start and no timer, which is how the
 * test suites keep an app from picking up steps older runs left in the database. A run that is
 * still going makes the next tick wait, and a run that fails is logged and the timer carries on.
 */
@Injectable()
export class StockStepProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('StockStepOutbox');
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<void> | undefined;

  constructor(
    private readonly applier: StockStepApplier,
    @Inject(OUTBOX_SETTINGS) private readonly settings: OutboxSettings,
  ) {}

  onApplicationBootstrap(): void {
    if (this.settings.pollIntervalMs === 0) {
      return;
    }
    void this.run();
    this.timer = setInterval(() => void this.run(), this.settings.pollIntervalMs);
    // A script that boots the application context must be able to end while the timer is set.
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.current;
  }

  run(): Promise<void> {
    this.current ??= this.applier
      .applyDue()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error('Applying the due stock steps failed.', error);
      })
      .finally(() => {
        this.current = undefined;
      });
    return this.current;
  }
}
