import { describe, expect, it } from 'vitest';
import { FakeAssignmentRepository } from '../../../../../../../test/support/fakes/fake-assignment.repository';
import { FakeClock } from '../../../../../../../test/support/fakes/fake-clock';
import { RecordingDomainEventPublisher } from '../../../../../../../test/support/fakes/recording-domain-event-publisher';
import { RoleRevokedFromUser } from '../../../domain/events/role-revoked-from-user.event';
import { RevokeRoleFromUserCommand } from './revoke-role-from-user.command';
import { RevokeRoleFromUserUseCase } from './revoke-role-from-user.use-case';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MECHANIC_ROLE_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ROLE_ID = '33333333-3333-4333-8333-333333333333';

async function makeHandler() {
  const assignments = new FakeAssignmentRepository();
  await assignments.assignRoleToUser(USER_ID, MECHANIC_ROLE_ID);
  await assignments.assignRoleToUser(USER_ID, CUSTOMER_ROLE_ID);
  const events = new RecordingDomainEventPublisher();
  const clock = new FakeClock();
  return {
    handler: new RevokeRoleFromUserUseCase(assignments, clock, events),
    assignments,
    events,
    clock,
  };
}

describe('RevokeRoleFromUserUseCase', () => {
  it("removes the role the user holds, keeps the user's other roles and publishes the revocation", async () => {
    const { handler, assignments, events, clock } = await makeHandler();

    await handler.execute(new RevokeRoleFromUserCommand(USER_ID, MECHANIC_ROLE_ID));

    expect([...assignments.userRoles]).toEqual([`${USER_ID}:${CUSTOMER_ROLE_ID}`]);
    expect(events.published).toEqual([
      new RoleRevokedFromUser(USER_ID, MECHANIC_ROLE_ID, clock.now()),
    ]);
  });

  it('changes nothing and publishes nothing when the user does not hold the role', async () => {
    const { handler, assignments, events } = await makeHandler();

    await handler.execute(
      new RevokeRoleFromUserCommand(USER_ID, '44444444-4444-4444-8444-444444444444'),
    );

    expect(assignments.userRoles.size).toBe(2);
    expect(events.published).toEqual([]);
  });
});
