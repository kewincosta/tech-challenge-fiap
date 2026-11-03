import { createTransport } from 'nodemailer';
import { Mailer, MailMessage } from '../../application/ports/mailer.port';

/** What the adapter asks of a nodemailer transport. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** A server that asks for no login leaves both out. */
  user?: string;
  password?: string;
  /** The sender of every message, as `Name <address>` or the address alone. */
  from: string;
}

/**
 * Sends through an SMTP server with nodemailer: Mailpit in local development, any server the
 * settings name elsewhere. `send` rejects when the server does not take the message, and the
 * caller decides what that means.
 */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  /** Port 465 speaks TLS from the first byte. On any other port nodemailer upgrades with STARTTLS when the server offers it. */
  static create(settings: SmtpSettings): SmtpMailer {
    const transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth:
        settings.user === undefined ? undefined : { user: settings.user, pass: settings.password },
    });
    return new SmtpMailer(transport, settings.from);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
