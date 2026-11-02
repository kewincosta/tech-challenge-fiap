import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** The build context of the image and the project directory of the compose file. */
export const REPOSITORY_ROOT = resolve(__dirname, '../../..');

/** Every container, network and image a spec creates carries this label, so strays are easy to find. */
export const TEST_LABEL = 'workshop.infra-test=true';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Returns the result of a command that exits non-zero instead of throwing. */
  allowFailure?: boolean;
}

function lastLines(text: string, count = 40): string {
  return text.trim().split('\n').slice(-count).join('\n');
}

export async function run(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 512 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    const result: CommandResult = {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? String(error),
    };
    if (options.allowFailure) {
      return result;
    }
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.code}:\n${lastLines(result.stderr || result.stdout)}`,
    );
  }
}

export function docker(args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return run('docker', args, options);
}

/** A name no other run or developer container shares. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

/** A port nothing listens on at the moment. */
export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('The server got no TCP port.'));
        } else {
          resolvePort(address.port);
        }
      });
    });
  });
}

/** The host port Docker published for a port of a running container. */
export async function publishedPort(container: string, containerPort: number): Promise<number> {
  const { stdout } = await docker(['port', container, `${containerPort}/tcp`]);
  const port = /:(\d+)\s*$/m.exec(stdout)?.[1];
  if (port === undefined) {
    throw new Error(`${container} publishes no host port for ${containerPort}: ${stdout}`);
  }
  return Number(port);
}

/** Calls `probe` until it returns something other than `undefined` or `false`, or time runs out. */
export async function waitUntil<T>(
  what: string,
  probe: () => Promise<T | undefined | false>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 60000, intervalMs = 500 } = options;
  const deadline = Date.now() + timeoutMs;
  let lastFailure = '';
  for (;;) {
    try {
      const value = await probe();
      if (value !== undefined && value !== false) {
        return value;
      }
    } catch (error) {
      lastFailure = `: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Gave up waiting ${timeoutMs} ms for ${what}${lastFailure}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
}

/** Builds the production image from the working tree, the way `docker build .` does. */
export async function buildImage(tag: string): Promise<void> {
  await docker(['build', '--label', TEST_LABEL, '--tag', tag, REPOSITORY_ROOT]);
}

/** The tasks that remove what a spec created, run last to first and even when a test failed. */
export class Cleanup {
  private readonly tasks: Array<() => Promise<unknown>> = [];

  add(task: () => Promise<unknown>): void {
    this.tasks.push(task);
  }

  async run(): Promise<void> {
    const failures: unknown[] = [];
    for (const task of this.tasks.splice(0).reverse()) {
      try {
        await task();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'The cleanup of the spec failed.');
    }
  }
}
