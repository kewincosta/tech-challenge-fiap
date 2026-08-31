export const AppPermission = {
  UsersRead: 'users:read',
  RolesRead: 'roles:read',
  RolesManage: 'roles:manage',
  GroupsRead: 'groups:read',
  GroupsManage: 'groups:manage',
  PermissionsRead: 'permissions:read',
  UserAccessRead: 'user-access:read',
  UserAccessManage: 'user-access:manage',
  SessionsRevokeAny: 'sessions:revoke-any',
} as const;

export type AppPermissionCode = (typeof AppPermission)[keyof typeof AppPermission];
