import { Request, Response, NextFunction } from 'express';
import { ForbiddenException } from '../../../shared/exceptions/base.exception.js';

export type UserRole = 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'AGENT';

const roleHierarchy: Record<UserRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  SUPERVISOR: 2,
  AGENT: 1,
};

export type Permission =
  | 'users:create'
  | 'users:read'
  | 'users:update'
  | 'users:delete'
  | 'channels:create'
  | 'channels:read'
  | 'channels:view'
  | 'channels:update'
  | 'channels:edit'
  | 'channels:delete'
  | 'conversations:read'
  | 'conversations:view'
  | 'conversations:read:all'
  | 'conversations:assign'
  | 'conversations:edit'
  | 'conversations:reply'
  | 'conversations:close'
  | 'conversations:delete'
  | 'contacts:create'
  | 'contacts:read'
  | 'contacts:update'
  | 'contacts:delete'
  | 'contacts:import'
  | 'contacts:export'
  | 'automation:create'
  | 'automation:read'
  | 'automation:update'
  | 'automation:delete'
  | 'broadcasts:create'
  | 'broadcasts:read'
  | 'broadcasts:send'
  | 'broadcasts:delete'
  | 'analytics:read'
  | 'analytics:read:team'
  | 'analytics:export'
  | 'organization:read'
  | 'organization:update'
  | 'organization:delete'
  | 'team:view'
  | 'team:edit'
  | 'team:invite'
  | 'team:remove';

const resourcePermissions: Record<string, Record<string, UserRole[]>> = {
  users: {
    create: ['OWNER', 'ADMIN'],
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    update: ['OWNER', 'ADMIN'],
    delete: ['OWNER', 'ADMIN'],
  },
  channels: {
    create: ['OWNER', 'ADMIN'],
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    view: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    update: ['OWNER', 'ADMIN'],
    edit: ['OWNER', 'ADMIN'],
    delete: ['OWNER', 'ADMIN'],
  },
  conversations: {
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    view: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    'read:all': ['OWNER', 'ADMIN', 'SUPERVISOR'],
    assign: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    edit: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    reply: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    close: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
  },
  contacts: {
    create: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    update: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    delete: ['OWNER', 'ADMIN'],
    import: ['OWNER', 'ADMIN'],
    export: ['OWNER', 'ADMIN'],
  },
  automation: {
    create: ['OWNER', 'ADMIN'],
    read: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    update: ['OWNER', 'ADMIN'],
    delete: ['OWNER', 'ADMIN'],
  },
  broadcasts: {
    create: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    read: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    send: ['OWNER', 'ADMIN'],
    delete: ['OWNER', 'ADMIN'],
  },
  analytics: {
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    'read:team': ['OWNER', 'ADMIN', 'SUPERVISOR'],
    export: ['OWNER', 'ADMIN'],
  },
  organization: {
    read: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    update: ['OWNER', 'ADMIN'],
    delete: ['OWNER'],
  },
  team: {
    view: ['OWNER', 'ADMIN', 'SUPERVISOR', 'AGENT'],
    edit: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    invite: ['OWNER', 'ADMIN', 'SUPERVISOR'],
    remove: ['OWNER', 'ADMIN', 'SUPERVISOR'],
  },
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const [resource, action] = permission.split(':');
  const allowedRoles = resourcePermissions[resource]?.[action];
  return allowedRoles?.includes(role) ?? false;
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole | undefined;

    if (!userRole) {
      throw new ForbiddenException('Authentication required');
    }

    if (!hasPermission(userRole, permission)) {
      throw new ForbiddenException(`Insufficient permissions for: ${permission}`);
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole | undefined;

    if (!userRole || !roles.includes(userRole)) {
      throw new ForbiddenException(`Role ${roles.join(' or ')} required`);
    }

    next();
  };
}

export function requireMinRole(minRole: UserRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole | undefined;

    if (!userRole) {
      throw new ForbiddenException('Authentication required');
    }

    const userLevel = roleHierarchy[userRole];
    const requiredLevel = roleHierarchy[minRole];

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(`Minimum role ${minRole} required`);
    }

    next();
  };
}
