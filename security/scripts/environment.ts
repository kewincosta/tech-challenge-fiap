import { commandExists, run } from './exec';

/**
 * What is available on this machine, and what can safely be done about what is not.
 *
 * The rule for automatic installation: nothing that changes the host outside a container unless
 * the operator asked for it with `--install`. Semgrep runs from a pinned Docker image when the
 * binary is missing, which needs no installation at all; the pipx path exists only as a fallback
 * for a machine without Docker, and even then only on request.
 */

export interface ToolStatus {
  name: string;
  available: boolean;
  version: string | null;
  detail: string | null;
}

export interface Environment {
  node: ToolStatus;
  npm: ToolStatus;
  docker: ToolStatus;
  semgrep: ToolStatus;
}

const MIN_NODE_MAJOR = 22;
/** Pinned on purpose: an unpinned install is an unreviewed install. */
export const SEMGREP_PIP_VERSION = '1.97.0';

function firstLine(text: string): string | null {
  const line = text.trim().split('\n')[0]?.trim();
  return line && line.length > 0 ? line : null;
}

export function checkNode(): ToolStatus {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0] ?? '0', 10);
  const available = major >= MIN_NODE_MAJOR;
  return {
    name: 'Node.js',
    available,
    version,
    detail: available ? null : `Node.js ${MIN_NODE_MAJOR} or newer is required (found ${version}).`,
  };
}

export async function checkNpm(): Promise<ToolStatus> {
  try {
    const result = await run('npm', ['--version'], { timeoutMs: 20_000 });
    if (result.code === 0) {
      return { name: 'npm', available: true, version: firstLine(result.stdout), detail: null };
    }
  } catch {
    // falls through to the unavailable answer below
  }
  return { name: 'npm', available: false, version: null, detail: 'npm was not found on PATH.' };
}

/**
 * The daemon has to answer, not just the client: `docker --version` succeeds on a machine where
 * the daemon is stopped, and every container-based scanner would then fail one by one.
 */
export async function checkDocker(): Promise<ToolStatus> {
  try {
    const version = await run('docker', ['--version'], { timeoutMs: 20_000 });
    if (version.code !== 0) {
      return {
        name: 'Docker',
        available: false,
        version: null,
        detail: 'The docker CLI was not found on PATH.',
      };
    }
    const info = await run('docker', ['info', '--format', '{{.ServerVersion}}'], {
      timeoutMs: 30_000,
    });
    if (info.code !== 0) {
      return {
        name: 'Docker',
        available: false,
        version: firstLine(version.stdout),
        detail: 'The docker CLI is installed but the daemon did not answer.',
      };
    }
    return { name: 'Docker', available: true, version: firstLine(version.stdout), detail: null };
  } catch {
    return {
      name: 'Docker',
      available: false,
      version: null,
      detail: 'The docker CLI was not found on PATH.',
    };
  }
}

export async function checkSemgrep(): Promise<ToolStatus> {
  try {
    const result = await run('semgrep', ['--version'], { timeoutMs: 30_000 });
    if (result.code === 0) {
      return { name: 'Semgrep', available: true, version: firstLine(result.stdout), detail: null };
    }
  } catch {
    // falls through to the unavailable answer below
  }
  return {
    name: 'Semgrep',
    available: false,
    version: null,
    detail: 'Semgrep was not found on PATH.',
  };
}

export async function inspectEnvironment(): Promise<Environment> {
  const [npm, docker, semgrep] = await Promise.all([checkNpm(), checkDocker(), checkSemgrep()]);
  return { node: checkNode(), npm, docker, semgrep };
}

export type SemgrepRunner =
  | { kind: 'local' }
  | { kind: 'docker'; image: string }
  | { kind: 'unavailable'; reason: string; instructions: string[] };

/**
 * How Semgrep will be run, in order of least intrusiveness: the binary already on the machine,
 * then a pinned container, then nothing at all with instructions to install it by hand.
 */
export function resolveSemgrepRunner(environment: Environment, image: string): SemgrepRunner {
  if (environment.semgrep.available) {
    return { kind: 'local' };
  }
  if (environment.docker.available) {
    return { kind: 'docker', image };
  }
  return {
    kind: 'unavailable',
    reason: 'Semgrep is not installed and Docker is not available to run it in a container.',
    instructions: [
      `pipx install semgrep==${SEMGREP_PIP_VERSION}`,
      `python3 -m pip install --user semgrep==${SEMGREP_PIP_VERSION}`,
      'brew install semgrep',
      'Or start Docker and run the scan again; no installation is needed then.',
    ],
  };
}

export interface InstallOutcome {
  attempted: boolean;
  installed: boolean;
  message: string;
}

/**
 * Installs the pinned Semgrep with pipx, and only pipx: it puts the tool in its own environment
 * instead of mutating the system interpreter's packages. Reached only when `--install` was passed
 * and Docker is unavailable.
 */
export async function installSemgrep(): Promise<InstallOutcome> {
  const hasPipx = await commandExists('pipx', ['--version']);
  if (!hasPipx) {
    return {
      attempted: false,
      installed: false,
      message:
        'pipx was not found, and this tool will not install into the system Python. ' +
        `Install pipx, then run: pipx install semgrep==${SEMGREP_PIP_VERSION}`,
    };
  }
  try {
    const result = await run('pipx', ['install', `semgrep==${SEMGREP_PIP_VERSION}`], {
      timeoutMs: 600_000,
    });
    if (result.code === 0) {
      return {
        attempted: true,
        installed: true,
        message: `Semgrep ${SEMGREP_PIP_VERSION} installed with pipx.`,
      };
    }
    return {
      attempted: true,
      installed: false,
      message: `pipx could not install Semgrep: ${firstLine(result.stderr) ?? 'unknown error'}`,
    };
  } catch (error) {
    return {
      attempted: true,
      installed: false,
      message: `pipx could not install Semgrep: ${(error as Error).message}`,
    };
  }
}

/**
 * Pulls an image ahead of the scan so a slow first download does not look like a hung scanner.
 * A failure here is not fatal: the run that follows will surface the real reason.
 */
export async function pullImage(image: string): Promise<boolean> {
  try {
    const result = await run('docker', ['pull', '--quiet', image], { timeoutMs: 900_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}
