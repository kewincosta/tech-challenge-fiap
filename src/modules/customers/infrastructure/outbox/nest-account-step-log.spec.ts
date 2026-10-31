import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStepKind } from '../../application/ports/pending-account-steps.port';
import { NestAccountStepLog } from './nest-account-step-log';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NestAccountStepLog', () => {
  it('logs at error level the kind of the step, its operation id, the user and the last error, under AccountStepOutbox', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    new NestAccountStepLog().failed(
      { operationId: OPERATION_ID, kind: AccountStepKind.DiscardAccount, userId: USER_ID },
      'the account is in use',
    );

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      `Account step DISCARD_ACCOUNT ${OPERATION_ID} for user ${USER_ID} failed for good: the account is in use`,
    );
    expect(error.mock.contexts[0]).toMatchObject({ context: 'AccountStepOutbox' });
  });
});
