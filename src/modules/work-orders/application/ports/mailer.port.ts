/** One e-mail, ready to send: the same content as plain text and as HTML. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Rejects when the mail server did not take the message. Nothing sends it again. */
  send(message: MailMessage): Promise<void>;
}
