import {
  Mailer,
  MailMessage,
} from '../../../src/modules/work-orders/application/ports/mailer.port';

/** Keeps every message it is asked to send, in order, and sends none. */
export class RecordingMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The messages sent to one address, in the order they were sent. */
  sentTo(address: string): MailMessage[] {
    return this.sent.filter((message) => message.to === address);
  }

  /**
   * Waits until `count` messages have gone to `address` and returns them. A subscriber runs after
   * the request that published its event has answered, so a test reads the messages with this and
   * not right after the request.
   */
  async waitForMailTo(address: string, count: number, timeoutMs = 5000): Promise<MailMessage[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.sentTo(address).length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} e-mail(s) to ${address} within ${timeoutMs} ms, got ${this.sentTo(address).length}.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.sentTo(address);
  }
}

/** Refuses every message, the way a mail server that is down does, and keeps what it was asked. */
export class FailingMailer implements Mailer {
  readonly attempts: MailMessage[] = [];

  constructor(readonly error: Error = new Error('The mail server refused the message.')) {}

  async send(message: MailMessage): Promise<void> {
    this.attempts.push(message);
    return Promise.reject(this.error);
  }

  /** Waits until `count` messages were offered, since the subscriber runs after the request. */
  async waitForAttempts(count: number, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.attempts.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} attempt(s) to send within ${timeoutMs} ms, got ${this.attempts.length}.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
