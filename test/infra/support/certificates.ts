import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cleanup, run } from './docker';

export interface TestCertificates {
  /**
   * The directory a container mounts. It holds the public certificate of each authority
   * (ca.crt and other-ca.crt) and the certificate and key of the PostgreSQL (postgres.crt,
   * postgres.key) and of the Redis (redis.crt, redis.key), all signed by the first authority.
   */
  directory: string;
  /** The authority that signed the server certificates. */
  authority: string;
  /** An authority that signed none of them. */
  otherAuthority: string;
}

/** The name the Redis container answers to on its network, and the one its certificate names. */
export const REDIS_HOST_NAME = 'redis.tls.test';

async function openssl(...args: string[]): Promise<void> {
  await run('openssl', args);
}

async function createAuthority(name: string, certificate: string, key: string): Promise<void> {
  await openssl(
    ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes'],
    ...['-keyout', key, '-out', certificate, '-days', '2', '-subj', `/CN=${name}`],
    ...['-addext', 'basicConstraints=critical,CA:TRUE'],
    ...['-addext', 'keyUsage=critical,keyCertSign,cRLSign'],
  );
}

async function signServerCertificate(options: {
  name: string;
  alternativeNames: string;
  authority: { certificate: string; key: string };
  directory: string;
  workspace: string;
}): Promise<void> {
  const { name, alternativeNames, authority, directory, workspace } = options;
  const request = join(workspace, `${name}.csr`);
  const extensions = join(workspace, `${name}.ext`);
  writeFileSync(
    extensions,
    [
      `subjectAltName=${alternativeNames}`,
      'basicConstraints=CA:FALSE',
      'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth',
    ].join('\n'),
  );
  const key = join(directory, `${name}.key`);
  await openssl(
    ...['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', request],
    ...['-subj', '/CN=localhost'],
  );
  await openssl(
    ...['x509', '-req', '-in', request, '-CA', authority.certificate, '-CAkey', authority.key],
    ...['-CAcreateserial', '-out', join(directory, `${name}.crt`), '-days', '2'],
    ...['-extfile', extensions],
  );
  // A throwaway key a container of another user has to read.
  chmodSync(key, 0o644);
}

/**
 * Two certificate authorities and the server certificates the first one signs, made with openssl in
 * a temporary directory that `cleanup` removes. The authorities' keys stay out of the directory a
 * container mounts.
 */
export async function createTestCertificates(cleanup: Cleanup): Promise<TestCertificates> {
  const directory = mkdtempSync(join(tmpdir(), 'workshop-infra-certificates-'));
  const workspace = mkdtempSync(join(tmpdir(), 'workshop-infra-authorities-'));
  cleanup.add(() => {
    rmSync(directory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    return Promise.resolve();
  });
  chmodSync(directory, 0o755);

  const authority = {
    certificate: join(directory, 'ca.crt'),
    key: join(workspace, 'ca.key'),
  };
  await createAuthority('Workshop test authority', authority.certificate, authority.key);
  const otherAuthority = join(directory, 'other-ca.crt');
  await createAuthority('Another test authority', otherAuthority, join(workspace, 'other-ca.key'));

  await signServerCertificate({
    name: 'postgres',
    alternativeNames: 'DNS:localhost,IP:127.0.0.1',
    authority,
    directory,
    workspace,
  });
  await signServerCertificate({
    name: 'redis',
    alternativeNames: `DNS:localhost,DNS:${REDIS_HOST_NAME}`,
    authority,
    directory,
    workspace,
  });
  return { directory, authority: authority.certificate, otherAuthority };
}
