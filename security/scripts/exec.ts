import { spawn } from 'node:child_process';

/**
 * Every external process this tool starts goes through here.
 *
 * `spawn` with an argument array and no shell is the point: the target URL, the image tag and the
 * paths all come from a configuration file, and building a shell string out of them would make
 * that file a command injection vector against whoever runs the scan.
 */

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Caps what is kept in memory; a scanner that floods stdout must not exhaust the heap. */
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export async function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBytes < maxOutputBytes) {
        stdout.push(chunk);
        stdoutBytes += chunk.length;
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes < maxOutputBytes) {
        stderr.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
      });
    });
  });
}

/** True when the binary exists and answers. Used only for the dependency checks. */
export async function commandExists(command: string, args: readonly string[]): Promise<boolean> {
  try {
    const result = await run(command, args, { timeoutMs: 15_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Parses a tool's JSON output, tolerating the banner lines some of them print before the payload.
 * Returns null instead of throwing: a scanner that produced unreadable output is a failed
 * scanner, not a crashed run.
 */
export function parseJsonOutput<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.search(/[[{]/);
    if (start < 0) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(start)) as T;
    } catch {
      return null;
    }
  }
}
