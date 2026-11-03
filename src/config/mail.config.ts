import { registerAs } from '@nestjs/config';

export const mailConfig = registerAs('mail', () => ({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  // An empty value in a dotenv file means "no login", the same as a missing one.
  user: process.env.SMTP_USER || undefined,
  password: process.env.SMTP_PASSWORD || undefined,
  from: process.env.MAIL_FROM ?? 'Oficina <no-reply@workshop.local>',
}));
