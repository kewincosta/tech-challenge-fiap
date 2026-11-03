import { createServer } from 'node:net';
import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { MailMessage } from '../../application/ports/mailer.port';
import { MailTransport, SmtpMailer } from './smtp-mailer';

const FROM = 'Oficina <no-reply@workshop.local>';

const MESSAGE: MailMessage = {
  to: 'jane@example.com',
  subject: 'Ordem de serviço A1B090-2026: Execução',
  text: 'Olá, Jane.\n\nSituação: Execução.',
  html: '<p>Olá, Jane.</p>\n<p>Situação: Execução.</p>',
};

describe('SmtpMailer', () => {
  it('sends the message through the configured transport', async () => {
    const offered: unknown[] = [];
    const transport: MailTransport = {
      sendMail: (message) => {
        offered.push(message);
        return Promise.resolve({});
      },
    };

    await new SmtpMailer(transport, FROM).send(MESSAGE);

    expect(offered).toEqual([
      {
        from: FROM,
        to: 'jane@example.com',
        subject: 'Ordem de serviço A1B090-2026: Execução',
        text: 'Olá, Jane.\n\nSituação: Execução.',
        html: '<p>Olá, Jane.</p>\n<p>Situação: Execução.</p>',
      },
    ]);
  });

  it('builds a message nodemailer reads as the sender, the recipient, the subject and both bodies', async () => {
    const built: Array<Record<string, unknown>> = [];
    const jsonTransport = createTransport({ jsonTransport: true });
    const transport: MailTransport = {
      sendMail: async (message) => {
        const info = await jsonTransport.sendMail(message);
        built.push(JSON.parse(info.message) as Record<string, unknown>);
        return info;
      },
    };

    await new SmtpMailer(transport, FROM).send(MESSAGE);

    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({
      from: { name: 'Oficina', address: 'no-reply@workshop.local' },
      to: [{ address: 'jane@example.com' }],
      subject: 'Ordem de serviço A1B090-2026: Execução',
      text: 'Olá, Jane.\n\nSituação: Execução.',
      html: '<p>Olá, Jane.</p>\n<p>Situação: Execução.</p>',
    });
  });

  it('rejects with the error of the transport, so the caller can log it', async () => {
    const refusal = new Error('connect ECONNREFUSED 127.0.0.1:1025');
    const transport: MailTransport = { sendMail: () => Promise.reject(refusal) };

    await expect(new SmtpMailer(transport, FROM).send(MESSAGE)).rejects.toBe(refusal);
  });

  it('delivers the message to the SMTP server the settings name', async () => {
    const smtp = await listenForOneMessage();
    try {
      const mailer = SmtpMailer.create({ host: '127.0.0.1', port: smtp.port, from: FROM });

      await mailer.send(MESSAGE);

      const received = await smtp.received;
      expect(received.from).toBe('no-reply@workshop.local');
      expect(received.to).toEqual(['jane@example.com']);
      expect(received.data).toContain('From: Oficina <no-reply@workshop.local>');
      expect(received.data).toContain('To: jane@example.com');
      expect(received.data).toContain('Content-Type: multipart/alternative');
      expect(received.data).toContain('Content-Type: text/plain');
      expect(received.data).toContain('Content-Type: text/html');
    } finally {
      await smtp.close();
    }
  });

  it('rejects when no server answers at the address of the settings', async () => {
    const smtp = await listenForOneMessage();
    const { port } = smtp;
    await smtp.close();

    const mailer = SmtpMailer.create({ host: '127.0.0.1', port, from: FROM });

    await expect(mailer.send(MESSAGE)).rejects.toThrow();
  });
});

interface ReceivedMail {
  from: string;
  to: string[];
  data: string;
}

/**
 * The few commands of SMTP that one message needs, on an ephemeral port of the loopback address:
 * enough for nodemailer to deliver, with no login and no TLS.
 */
async function listenForOneMessage(): Promise<{
  port: number;
  received: Promise<ReceivedMail>;
  close: () => Promise<void>;
}> {
  let deliver: (mail: ReceivedMail) => void = () => undefined;
  const received = new Promise<ReceivedMail>((resolve) => {
    deliver = resolve;
  });
  const server = createServer((socket) => {
    const mail: ReceivedMail = { from: '', to: [], data: '' };
    let buffer = '';
    let readingData = false;
    socket.write('220 localhost ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (readingData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) {
            return;
          }
          mail.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          readingData = false;
          deliver(mail);
          socket.write('250 OK queued\r\n');
          continue;
        }
        const newline = buffer.indexOf('\r\n');
        if (newline === -1) {
          return;
        }
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.toUpperCase();
        if (command.startsWith('MAIL FROM:')) {
          mail.from = /<(.*)>/.exec(line)?.[1] ?? '';
          socket.write('250 OK\r\n');
        } else if (command.startsWith('RCPT TO:')) {
          mail.to.push(/<(.*)>/.exec(line)?.[1] ?? '');
          socket.write('250 OK\r\n');
        } else if (command === 'DATA') {
          readingData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 Bye\r\n');
        } else {
          socket.write('250 localhost\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test SMTP server has no port.');
  }
  return {
    port: address.port,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
