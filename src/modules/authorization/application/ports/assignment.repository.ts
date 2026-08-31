export interface AssignmentRepository {
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  removeRoleFromUser(userId: string, roleId: string): Promise<boolean>;
  addUserToGroup(userId: string, groupId: string): Promise<void>;
  removeUserFromGroup(userId: string, groupId: string): Promise<boolean>;
}

export const ASSIGNMENT_REPOSITORY = Symbol('AssignmentRepository');
