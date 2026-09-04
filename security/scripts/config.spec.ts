import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config';

const minimal = {
  application: { baseUrl: 'http://localhost:13000', apiPrefix: '/api/v1' },
  openapi: { url: 'http://localhost:13000/api/docs-json', path: null },
};

describe('parseConfig', () => {
  it('fills every optional section with a default', () => {
    const config = parseConfig(minimal);

    expect(config.scanners).toEqual({
      npmAudit: true,
      semgrep: true,
      dependencyCheck: true,
      zap: true,
    });
    expect(config.semgrep.config).toBe('p/security-audit');
    expect(config.zap.mode).toBe('auto');
    expect(config.report.markdown).toBe(true);
  });

  it('strips a trailing slash off the base URL', () => {
    expect(
      parseConfig({
        ...minimal,
        application: { baseUrl: 'http://localhost:13000/', apiPrefix: '/' },
      }).application.baseUrl,
    ).toBe('http://localhost:13000');
  });

  it.each(['file:///etc/passwd', 'ftp://example.test', 'not a url'])(
    'refuses %s as a base URL',
    (baseUrl) => {
      expect(() => parseConfig({ ...minimal, application: { baseUrl, apiPrefix: '/' } })).toThrow(
        ConfigError,
      );
    },
  );

  it('accepts a null OpenAPI URL, which means no API scan', () => {
    expect(parseConfig({ ...minimal, openapi: { url: null, path: null } }).openapi.url).toBeNull();
  });

  it.each(['baseline', 'api', 'auto'])('accepts the ZAP mode %s', (mode) => {
    expect(parseConfig({ ...minimal, zap: { mode } }).zap.mode).toBe(mode);
  });

  it('refuses an unknown ZAP mode', () => {
    expect(() => parseConfig({ ...minimal, zap: { mode: 'aggressive' } })).toThrow(ConfigError);
  });

  it.each([0, -1, 'soon'])('refuses %s as a timeout', (timeoutMs) => {
    expect(() => parseConfig({ ...minimal, semgrep: { timeoutMs } })).toThrow(ConfigError);
  });

  it('refuses a non-boolean scanner toggle', () => {
    expect(() => parseConfig({ ...minimal, scanners: { zap: 'yes' } })).toThrow(ConfigError);
  });

  it.each([null, 'a string', 42, []])('refuses %s as the whole config', (raw) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError);
  });

  it('names the offending field in the message', () => {
    expect(() => parseConfig({ ...minimal, zap: { timeoutMs: -1 } })).toThrow(/zap.timeoutMs/);
  });
});
