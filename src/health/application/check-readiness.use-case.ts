import { ReadinessChecks } from './ports/readiness-checks.port';

// A probe that waits longer than this has already failed it, and a dependency that hangs must not
// hold the request open for as long as it hangs.
const CHECK_TIMEOUT_MS = 2000;

export type CheckState = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: { database: CheckState; redis: CheckState };
}

export class CheckReadinessUseCase {
  constructor(private readonly checks: ReadinessChecks) {}

  async execute(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.stateOf(() => this.checks.database()),
      this.stateOf(() => this.checks.redis()),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: { database, redis },
    };
  }

  // The check that has not answered after the timeout is down, and nobody waits for it any longer.
  private async stateOf(check: () => Promise<void>): Promise<CheckState> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<CheckState>((resolve) => {
      timer = setTimeout(() => resolve('down'), CHECK_TIMEOUT_MS);
    });
    const answer = Promise.resolve()
      .then(check)
      .then(
        (): CheckState => 'up',
        (): CheckState => 'down',
      );
    try {
      return await Promise.race([answer, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
