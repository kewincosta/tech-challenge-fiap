import { SetMetadata } from '@nestjs/common';

export const ALLOWS_PENDING_PASSWORD_KEY = 'allowsPendingPassword';

export const AllowsPendingPassword = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOWS_PENDING_PASSWORD_KEY, true);
