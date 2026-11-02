import { Cleanup, docker, TEST_LABEL, uniqueName, waitUntil } from './docker';
import { REDIS_HOST_NAME } from './certificates';

/**
 * A Redis that accepts TLS and nothing else, with the certificate in redis.crt and redis.key of
 * `certificates`, signed by the authority in ca.crt. Containers on `network` reach it at
 * REDIS_HOST_NAME on port 6379.
 */
export async function startTlsRedis(options: {
  network: string;
  cleanup: Cleanup;
  certificates: string;
}): Promise<string> {
  const container = uniqueName('workshop-infra-redis');
  options.cleanup.add(() =>
    docker(['rm', '--force', '--volumes', container], { allowFailure: true }),
  );
  await docker([
    ...['run', '--detach', '--name', container, '--network', options.network],
    ...['--network-alias', REDIS_HOST_NAME, '--label', TEST_LABEL],
    ...['--volume', `${options.certificates}:/certs:ro`, 'redis:7-alpine', 'redis-server'],
    ...['--port', '0', '--tls-port', '6379', '--tls-auth-clients', 'no'],
    ...['--tls-cert-file', '/certs/redis.crt', '--tls-key-file', '/certs/redis.key'],
    ...['--tls-ca-cert-file', '/certs/ca.crt'],
  ]);
  await waitUntil(`${container} to answer over TLS`, async () => {
    const { stdout } = await docker([
      ...['exec', container, 'redis-cli', '--tls', '--cacert', '/certs/ca.crt'],
      ...['-h', 'localhost', 'ping'],
    ]);
    return stdout.trim() === 'PONG';
  });
  return container;
}
