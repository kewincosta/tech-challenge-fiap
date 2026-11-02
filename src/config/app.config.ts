import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  // The address customers reach the API at. The budget links of the e-mails start with it.
  publicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:13000',
}));
