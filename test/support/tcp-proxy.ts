import { connect, createServer, type Server, type Socket } from 'node:net';

export interface TcpProxy {
  host: string;
  port: number;
  /** Keeps every connection open and answers none, as a host behind a dropped route does. */
  stall: () => void;
  /** Drops every open connection and refuses the new ones. */
  cut: () => Promise<void>;
}

/**
 * A TCP relay in front of a real service, so a test can make the service unreachable for one
 * application without stopping the container every other suite shares. `cut` ends the relay.
 */
export async function startTcpProxy(target: { host: string; port: number }): Promise<TcpProxy> {
  const sockets = new Set<Socket>();
  let stalled = false;

  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  };

  const server: Server = createServer((client) => {
    track(client);
    if (stalled) {
      return;
    }
    const upstream = connect(target);
    track(upstream);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.on('data', (chunk) => {
      if (!stalled) {
        upstream.write(chunk);
      }
    });
    upstream.on('data', (chunk) => {
      if (!stalled) {
        client.write(chunk);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The proxy did not get a TCP port.');
  }

  return {
    host: '127.0.0.1',
    port: address.port,
    stall: () => {
      stalled = true;
    },
    cut: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      }),
  };
}
