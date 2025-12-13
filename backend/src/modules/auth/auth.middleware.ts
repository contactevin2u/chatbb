import { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../../shared/utils/jwt.js';
import { UnauthorizedException } from '../../shared/exceptions/base.exception.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      organizationId?: string;
    }
  }
}

export async function jwtMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await verifyToken(token);

    req.user = payload;
    req.organizationId = payload.organizationId;

    next();
  } catch (error) {
    next(new UnauthorizedException('Invalid or expired token'));
  }
}

export function optionalJwtMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  jwtMiddleware(req, _res, next);
}

// Alias for compatibility
export const authMiddleware = jwtMiddleware;
