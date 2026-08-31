import { AssignmentRepository } from '../../../src/modules/authorization/application/ports/assignment.repository';

export class FakeAssignmentRepository implements AssignmentRepository {
  readonly userRoles = new Set<string>();

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    this.userRoles.add(`${userId}:${roleId}`);
    return Promise.resolve();
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    return Promise.resolve(this.userRoles.delete(`${userId}:${roleId}`));
  }
}
