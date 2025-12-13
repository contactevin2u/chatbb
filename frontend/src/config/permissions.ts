export type UserRole = 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'AGENT';

export type Permission =
  // Conversation permissions
  | 'conversations:view'
  | 'conversations:view:all'
  | 'conversations:assign'
  | 'conversations:close'
  | 'conversations:delete'
  // Contact permissions
  | 'contacts:view'
  | 'contacts:create'
  | 'contacts:edit'
  | 'contacts:delete'
  | 'contacts:import'
  | 'contacts:export'
  // Channel permissions
  | 'channels:view'
  | 'channels:create'
  | 'channels:edit'
  | 'channels:delete'
  // Team permissions
  | 'team:view'
  | 'team:invite'
  | 'team:edit'
  | 'team:remove'
  | 'team:assign_roles'
  // Automation permissions
  | 'automation:view'
  | 'automation:create'
  | 'automation:edit'
  | 'automation:delete'
  // Broadcast permissions
  | 'broadcasts:view'
  | 'broadcasts:create'
  | 'broadcasts:edit'
  | 'broadcasts:delete'
  | 'broadcasts:send'
  // Reports permissions
  | 'reports:view'
  | 'reports:view:team'
  | 'reports:export'
  // Settings permissions
  | 'settings:view'
  | 'settings:organization'
  | 'settings:billing'
  | 'settings:integrations'
  | 'settings:api_keys';

export const rolePermissions: Record<UserRole, Permission[]> = {
  OWNER: [
    'conversations:view',
    'conversations:view:all',
    'conversations:assign',
    'conversations:close',
    'conversations:delete',
    'contacts:view',
    'contacts:create',
    'contacts:edit',
    'contacts:delete',
    'contacts:import',
    'contacts:export',
    'channels:view',
    'channels:create',
    'channels:edit',
    'channels:delete',
    'team:view',
    'team:invite',
    'team:edit',
    'team:remove',
    'team:assign_roles',
    'automation:view',
    'automation:create',
    'automation:edit',
    'automation:delete',
    'broadcasts:view',
    'broadcasts:create',
    'broadcasts:edit',
    'broadcasts:delete',
    'broadcasts:send',
    'reports:view',
    'reports:view:team',
    'reports:export',
    'settings:view',
    'settings:organization',
    'settings:billing',
    'settings:integrations',
    'settings:api_keys',
  ],

  ADMIN: [
    'conversations:view',
    'conversations:view:all',
    'conversations:assign',
    'conversations:close',
    'conversations:delete',
    'contacts:view',
    'contacts:create',
    'contacts:edit',
    'contacts:delete',
    'contacts:import',
    'contacts:export',
    'channels:view',
    'channels:create',
    'channels:edit',
    'channels:delete',
    'team:view',
    'team:invite',
    'team:edit',
    'team:remove',
    'automation:view',
    'automation:create',
    'automation:edit',
    'automation:delete',
    'broadcasts:view',
    'broadcasts:create',
    'broadcasts:edit',
    'broadcasts:delete',
    'broadcasts:send',
    'reports:view',
    'reports:view:team',
    'reports:export',
    'settings:view',
    'settings:integrations',
    'settings:api_keys',
  ],

  SUPERVISOR: [
    'conversations:view',
    'conversations:view:all',
    'conversations:assign',
    'conversations:close',
    'contacts:view',
    'contacts:create',
    'contacts:edit',
    'channels:view',
    'team:view',
    'automation:view',
    'broadcasts:view',
    'reports:view',
    'reports:view:team',
    'settings:view',
  ],

  AGENT: [
    'conversations:view',
    'conversations:close',
    'contacts:view',
    'contacts:create',
    'contacts:edit',
    'channels:view',
    'automation:view',
    'reports:view',
    'settings:view',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}
