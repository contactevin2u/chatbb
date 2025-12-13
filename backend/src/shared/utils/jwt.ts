import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../config/env.js';

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 60 * 60;
    case 'd':
      return num * 60 * 60 * 24;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

export async function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
  const expiresIn = parseDuration(env.JWT_ACCESS_EXPIRY);

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

export async function signRefreshToken(userId: string): Promise<string> {
  const expiresIn = parseDuration(env.JWT_REFRESH_EXPIRY);

  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as TokenPayload;
}

export function getTokenExpiry(duration: string): Date {
  const seconds = parseDuration(duration);
  return new Date(Date.now() + seconds * 1000);
}
