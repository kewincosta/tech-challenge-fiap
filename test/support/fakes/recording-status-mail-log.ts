import { StatusMailLog } from '../../../src/modules/work-orders/application/ports/status-mail-log.port';

/** Keeps the work order number and the error of each status e-mail that did not go out. */
export class RecordingStatusMailLog implements StatusMailLog {
  readonly failures: Array<{ workOrderNumber: string; error: unknown }> = [];

  failed(workOrderNumber: string, error: unknown): void {
    this.failures.push({ workOrderNumber, error });
  }
}
