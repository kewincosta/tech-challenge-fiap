import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NestStatusMailLog } from './nest-status-mail-log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NestStatusMailLog', () => {
  it('logs at error level the work order number and the reason, under StatusMail', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failure = new Error('connect ECONNREFUSED 127.0.0.1:1025');

    new NestStatusMailLog().failed('A1B090-2026', failure);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'The status e-mail of work order A1B090-2026 was not sent: connect ECONNREFUSED 127.0.0.1:1025',
      failure.stack,
    );
    expect(error.mock.contexts[0]).toMatchObject({ context: 'StatusMail' });
  });

  it('logs a failure that is not an Error by its text', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    new NestStatusMailLog().failed('A1B090-2026', 'quota exceeded');

    expect(error).toHaveBeenCalledWith(
      'The status e-mail of work order A1B090-2026 was not sent: quota exceeded',
      undefined,
    );
  });
});
