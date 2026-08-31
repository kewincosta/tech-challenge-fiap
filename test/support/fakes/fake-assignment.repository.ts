import { AssignmentRepository } from '../../../src/modules/authorization/application/ports/assignment.repository';

export class FakeAssignmentRepository implements AssignmentRepository {
  readonly userRoles = new Set<string>();
  readonly userGroups = new Set<string>();

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    this.userRoles.add(`${userId}:${roleId}`);
    return Promise.resolve();
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    return Promise.resolve(this.userRoles.delete(`${userId}:${roleId}`));
  }

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    this.userGroups.add(`${userId}:${groupId}`);
    return Promise.resolve();
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<boolean> {
    return Promise.resolve(this.userGroups.delete(`${userId}:${groupId}`));
  }
}
