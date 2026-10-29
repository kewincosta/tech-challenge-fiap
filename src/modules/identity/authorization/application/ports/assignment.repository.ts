export interface AssignmentRepository {
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  removeRoleFromUser(userId: string, roleId: string): Promise<boolean>;
}

export const ASSIGNMENT_REPOSITORY = Symbol('AssignmentRepository');
