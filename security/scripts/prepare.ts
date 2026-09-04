import { SecurityConfig } from './config';
import { run } from './exec';

/**
 * Environment preparation: bring the stack up, apply migrations, seed it, and make sure a
 * dedicated account exists for the dynamic scan to authenticate with.
 *
 * Without this, the dynamic scan reaches every route and is answered 401 by all of them, so the
 * only thing it can report is that the application refuses anonymous callers. With a token it
 * exercises the routes for real.
 */

export interface ScanCredentials {
  email: string;
  password: string;
  accessToken: string;
}

export interface PreparationStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreparationResult {
  steps: PreparationStep[];
  credentials: ScanCredentials | null;
  /** Why authentication is unavailable, when it is. Carried into the report's limitations. */
  authFailure: string | null;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  timeoutMs?: number;
}

interface ApiResponse<T> {
  status: number;
  body: T | null;
}

/** A small JSON client. `fetch` with a deadline, so a hung API cannot stall the whole scan. */
async function api<T>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let body: T | null = null;
    try {
      body = (await response.json()) as T;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

interface TokenPair {
  accessToken?: string;
}

async function login(
  baseUrl: string,
  apiPrefix: string,
  email: string,
  password: string,
): Promise<string | null> {
  const response = await api<TokenPair>(`${baseUrl}${apiPrefix}/auth/sessions`, {
    method: 'POST',
    body: { email, password },
  });
  return response.body?.accessToken ?? null;
}

/**
 * The same weighted sum `PersonDocument` verifies, run forwards. The scan account needs a CPF
 * that passes the domain's own validation, and generating one keeps the tool from shipping a
 * hardcoded document that could collide with real data.
 */
export function cpfFromBase(base: string): string {
  const digits = base.split('').map(Number);
  const first = checkDigit(digits, 10);
  const second = checkDigit([...digits, first], 11);
  return `${base}${first}${second}`;
}

function checkDigit(digits: number[], startWeight: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Deterministic per email, so re-running the scan reuses the account instead of creating one. */
export function scanDocument(email: string): string {
  let hash = 0;
  for (const char of email) {
    hash = (hash * 31 + char.charCodeAt(0)) % 900_000_000;
  }
  return cpfFromBase(String(100_000_000 + hash));
}

interface RoleSummary {
  id: string;
  name: string;
}

interface RegisteredUser {
  id: string;
}

interface CurrentUser {
  id: string;
  roles?: string[];
}

/**
 * Makes sure the scan account exists and can reach the administrative routes, then returns a
 * token for it.
 *
 * The account is created through the public registration route and promoted with a role grant,
 * both over the API. Nothing here writes to the database directly: the scan uses the same
 * surface an operator would.
 */
export async function ensureScanUser(
  config: SecurityConfig,
): Promise<{ credentials: ScanCredentials | null; detail: string }> {
  const { baseUrl, apiPrefix } = config.application;
  const { email, password, role, bootstrapEmail, bootstrapPassword } = config.authentication;

  // Signing in is not enough: an account left over from an earlier run may exist without the
  // role the scan needs, and a token that reaches nothing would produce the same empty result
  // as no token at all.
  const existingToken = await login(baseUrl, apiPrefix, email, password);
  let userId: string | null = null;
  if (existingToken) {
    const me = await api<CurrentUser>(`${baseUrl}${apiPrefix}/users/me`, { token: existingToken });
    if (me.body?.roles?.includes(role)) {
      return {
        credentials: { email, password, accessToken: existingToken },
        detail: `Reused the existing scan account ${email}, which already holds ${role}.`,
      };
    }
    userId = me.body?.id ?? null;
  }

  const bootstrapToken = await login(baseUrl, apiPrefix, bootstrapEmail, bootstrapPassword);
  if (!bootstrapToken) {
    return {
      credentials: null,
      detail:
        `Could not sign in as ${bootstrapEmail} to create the scan account. ` +
        'Run `npm run seed` first, or check authentication.bootstrapPassword.',
    };
  }

  if (!userId) {
    const registration = await api<RegisteredUser>(`${baseUrl}${apiPrefix}/users`, {
      method: 'POST',
      body: {
        email,
        name: 'Security Scanner',
        password,
        document: scanDocument(email),
      },
    });
    if (registration.status !== 201 || !registration.body?.id) {
      return {
        credentials: null,
        detail: `Could not register the scan account ${email} (HTTP ${registration.status}).`,
      };
    }
    userId = registration.body.id;
  }

  const roles = await api<RoleSummary[]>(`${baseUrl}${apiPrefix}/roles`, {
    token: bootstrapToken,
  });
  const target = roles.body?.find((candidate) => candidate.name === role);
  if (!target) {
    return {
      credentials: null,
      detail: `The role ${role} does not exist, so the scan account could not be promoted.`,
    };
  }

  const grant = await api<unknown>(`${baseUrl}${apiPrefix}/users/${userId}/roles/${target.id}`, {
    method: 'PUT',
    token: bootstrapToken,
  });
  if (grant.status !== 204) {
    const hint =
      grant.status === 403
        ? ` Only a SUPER_ADMIN may grant ${role}; point authentication.bootstrapEmail at that account.`
        : '';
    return {
      credentials: null,
      detail: `Could not grant ${role} to the scan account (HTTP ${grant.status}).${hint}`,
    };
  }

  const accessToken = await login(baseUrl, apiPrefix, email, password);
  if (!accessToken) {
    return {
      credentials: null,
      detail: 'The scan account was created but could not sign in.',
    };
  }
  return {
    credentials: { email, password, accessToken },
    detail: `Created the scan account ${email} and granted ${role}.`,
  };
}

/**
 * The endpoints that destroy the scanner's own credentials. Logout revokes every session of the
 * user, and changing the password does the same. A scan that reaches either one spends the rest
 * of its time being answered 401, which measures nothing.
 */
const SESSION_DESTROYING = [
  { path: '/auth/sessions', methods: ['delete'] },
  { path: '/auth/sessions/{id}', methods: ['delete'] },
  { path: '/users/me/password', methods: ['post'] },
];

interface OpenApiDocument {
  paths?: Record<string, Record<string, unknown>>;
}

/**
 * Fetches the OpenAPI definition and removes those endpoints from it.
 *
 * ZAP's own exclusion list guards the spider, not the requests the API scan seeds straight from
 * the definition: a run measured 240 calls to the password change route with the exclusion in
 * place. Filtering the definition itself is the only place that decides what the scan will send.
 */
export async function writeScanOpenApi(
  config: SecurityConfig,
  destination: string,
): Promise<{ ok: boolean; removed: string[]; detail: string }> {
  const url = config.openapi.url;
  if (!url) {
    return { ok: false, removed: [], detail: 'No OpenAPI URL is configured.' };
  }
  const document = await api<OpenApiDocument>(url, { timeoutMs: 20_000 });
  if (document.status !== 200 || !document.body?.paths) {
    return {
      ok: false,
      removed: [],
      detail: `Could not read the OpenAPI definition (HTTP ${document.status}).`,
    };
  }

  const { apiPrefix } = config.application;
  const removed: string[] = [];
  for (const entry of SESSION_DESTROYING) {
    for (const candidate of [entry.path, `${apiPrefix}${entry.path}`]) {
      const operations = document.body.paths[candidate];
      if (!operations) {
        continue;
      }
      for (const method of entry.methods) {
        if (method in operations) {
          delete operations[method];
          removed.push(`${method.toUpperCase()} ${candidate}`);
        }
      }
      if (Object.keys(operations).length === 0) {
        delete document.body.paths[candidate];
      }
    }
  }

  const { writeFileSync } = await import('node:fs');
  writeFileSync(destination, `${JSON.stringify(document.body, null, 2)}\n`, 'utf8');
  return {
    ok: true,
    removed,
    detail:
      removed.length > 0
        ? `Excluded from the scan definition: ${removed.join(', ')}.`
        : 'No session destroying endpoint was present in the definition.',
  };
}

/** Answers whether the application is serving, without caring what it answers. */
export async function applicationIsUp(url: string): Promise<boolean> {
  const response = await api(url, { timeoutMs: 5000 });
  return response.status > 0;
}

/**
 * Brings the stack to a state the scanners can work against: containers up, schema migrated,
 * data seeded. Every step is skipped when it is already satisfied, so running this repeatedly
 * costs one health check.
 */
export async function prepareEnvironment(
  config: SecurityConfig,
  projectRoot: string,
  options: { startStack: boolean },
): Promise<PreparationResult> {
  const steps: PreparationStep[] = [];
  const { baseUrl } = config.application;

  if (!(await applicationIsUp(baseUrl))) {
    if (!options.startStack) {
      steps.push({
        name: 'Application',
        ok: false,
        detail: `Not answering at ${baseUrl}. Run \`docker compose up -d\` or pass --prepare.`,
      });
      return { steps, credentials: null, authFailure: 'The application was not running.' };
    }
    const compose = await run('docker', ['compose', 'up', '-d'], {
      cwd: projectRoot,
      timeoutMs: 300_000,
    });
    if (compose.code !== 0) {
      steps.push({
        name: 'docker compose up',
        ok: false,
        detail: compose.stderr.trim().slice(0, 200) || 'failed',
      });
      return { steps, credentials: null, authFailure: 'The stack could not be started.' };
    }
    steps.push({ name: 'docker compose up', ok: true, detail: 'Stack started.' });
    await waitForApplication(baseUrl, 90_000);
  } else {
    steps.push({ name: 'Application', ok: true, detail: `Answering at ${baseUrl}.` });
  }

  if (options.startStack) {
    const migrations = await run('npm', ['run', 'migration:run'], {
      cwd: projectRoot,
      timeoutMs: 300_000,
    });
    steps.push({
      name: 'Migrations',
      ok: migrations.code === 0,
      detail: migrations.code === 0 ? 'Schema up to date.' : 'migration:run failed.',
    });

    const seed = await run('npm', ['run', 'seed'], { cwd: projectRoot, timeoutMs: 300_000 });
    steps.push({
      name: 'Seed',
      ok: seed.code === 0,
      detail: seed.code === 0 ? 'Actors and demo data present.' : 'seed failed.',
    });
  }

  if (!config.authentication.enabled) {
    steps.push({
      name: 'Scan account',
      ok: false,
      detail: 'Authentication is disabled in security.config.json.',
    });
    return {
      steps,
      credentials: null,
      authFailure: 'Authenticated scanning was disabled in the configuration.',
    };
  }

  const { credentials, detail } = await ensureScanUser(config);
  steps.push({ name: 'Scan account', ok: credentials !== null, detail });
  return {
    steps,
    credentials,
    authFailure: credentials ? null : detail,
  };
}

async function waitForApplication(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await applicationIsUp(baseUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}
