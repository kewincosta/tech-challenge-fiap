import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Reads `security/security.config.json` and validates it enough that a typo becomes a clear
 * message rather than a scanner failing later for an obscure reason. Deliberately hand-rolled:
 * the application validates its environment with zod, but this tool is not part of the running
 * application and should not pull the framework in.
 */

export interface SecurityConfig {
  application: { baseUrl: string; apiPrefix: string };
  openapi: { url: string | null; path: string | null };
  scanners: { npmAudit: boolean; semgrep: boolean; dependencyCheck: boolean; zap: boolean };
  semgrep: { config: string; dockerImage: string; timeoutMs: number };
  dependencyCheck: { dockerImage: string; timeoutMs: number };
  zap: { dockerImage: string; mode: 'auto' | 'baseline' | 'api'; timeoutMs: number };
  report: { title: string; markdown: boolean };
}

export class ConfigError extends Error {}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asString(value, path);
}

function asBoolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new ConfigError(`${path} must be a boolean.`);
  }
  return value;
}

function asTimeout(value: unknown, path: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`${path} must be a positive number of milliseconds.`);
  }
  return value;
}

/** Rejects anything that is not http or https, so a config file cannot point a scanner at a file. */
function asHttpUrl(value: unknown, path: string): string {
  const raw = asString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`${path} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${path} must use http or https.`);
  }
  return raw.replace(/\/+$/, '');
}

function asZapMode(value: unknown): 'auto' | 'baseline' | 'api' {
  const raw = asString(value, 'zap.mode', 'auto');
  if (raw !== 'auto' && raw !== 'baseline' && raw !== 'api') {
    throw new ConfigError('zap.mode must be one of: auto, baseline, api.');
  }
  return raw;
}

export function parseConfig(raw: unknown): SecurityConfig {
  const root = asRecord(raw, 'config');
  const application = asRecord(root.application ?? {}, 'application');
  const openapi = asRecord(root.openapi ?? {}, 'openapi');
  const scanners = asRecord(root.scanners ?? {}, 'scanners');
  const semgrep = asRecord(root.semgrep ?? {}, 'semgrep');
  const dependencyCheck = asRecord(root.dependencyCheck ?? {}, 'dependencyCheck');
  const zap = asRecord(root.zap ?? {}, 'zap');
  const report = asRecord(root.report ?? {}, 'report');

  const openapiUrl =
    openapi.url === undefined ? null : asNullableString(openapi.url, 'openapi.url');

  return {
    application: {
      baseUrl: asHttpUrl(application.baseUrl, 'application.baseUrl'),
      apiPrefix: asString(application.apiPrefix, 'application.apiPrefix', '/'),
    },
    openapi: {
      url: openapiUrl === null ? null : asHttpUrl(openapiUrl, 'openapi.url'),
      path: asNullableString(openapi.path, 'openapi.path'),
    },
    scanners: {
      npmAudit: asBoolean(scanners.npmAudit, 'scanners.npmAudit', true),
      semgrep: asBoolean(scanners.semgrep, 'scanners.semgrep', true),
      dependencyCheck: asBoolean(scanners.dependencyCheck, 'scanners.dependencyCheck', true),
      zap: asBoolean(scanners.zap, 'scanners.zap', true),
    },
    semgrep: {
      config: asString(semgrep.config, 'semgrep.config', 'p/security-audit'),
      dockerImage: asString(semgrep.dockerImage, 'semgrep.dockerImage', 'semgrep/semgrep:1.97.0'),
      timeoutMs: asTimeout(semgrep.timeoutMs, 'semgrep.timeoutMs', 600_000),
    },
    dependencyCheck: {
      dockerImage: asString(
        dependencyCheck.dockerImage,
        'dependencyCheck.dockerImage',
        'owasp/dependency-check:12.1.0',
      ),
      timeoutMs: asTimeout(dependencyCheck.timeoutMs, 'dependencyCheck.timeoutMs', 2_700_000),
    },
    zap: {
      dockerImage: asString(zap.dockerImage, 'zap.dockerImage', 'ghcr.io/zaproxy/zaproxy:stable'),
      mode: asZapMode(zap.mode),
      timeoutMs: asTimeout(zap.timeoutMs, 'zap.timeoutMs', 900_000),
    },
    report: {
      title: asString(report.title, 'report.title', 'Security Vulnerability Assessment'),
      markdown: asBoolean(report.markdown, 'report.markdown', true),
    },
  };
}

export function loadConfig(configPath: string): SecurityConfig {
  const absolute = resolve(configPath);
  let contents: string;
  try {
    contents = readFileSync(absolute, 'utf8');
  } catch {
    throw new ConfigError(`Could not read the configuration file at ${absolute}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ConfigError(`${absolute} is not valid JSON.`);
  }
  return parseConfig(parsed);
}
