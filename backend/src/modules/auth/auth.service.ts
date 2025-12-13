import { prisma } from '../../core/database/prisma.js';
import { hashPassword, verifyPassword, generateSecureToken } from '../../shared/utils/encryption.js';
import { signAccessToken, signRefreshToken, verifyToken, getTokenExpiry } from '../../shared/utils/jwt.js';
import { env } from '../../config/env.js';
import {
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '../../shared/exceptions/base.exception.js';
import type { User, Organization } from '@prisma/client';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
    avatarUrl: string | null;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) + '-' + Date.now().toString(36);
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { email, password, firstName, lastName, organizationName } = input;

    // Check if email exists
    const existingUser = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Create organization and user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: generateSlug(organizationName),
          plan: 'FREE',
          settings: {},
        },
      });

      // Create owner user
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: await hashPassword(password),
          firstName,
          lastName,
          role: 'OWNER',
          status: 'ACTIVE',
          organizationId: organization.id,
        },
      });

      return { user, organization };
    });

    // Generate tokens
    return this.generateAuthResponse(result.user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return this.generateAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
    // Find and validate refresh token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke old refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const accessToken = await signAccessToken({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      organizationId: storedToken.user.organizationId,
    });

    const newRefreshToken = generateSecureToken();
    const refreshExpiry = getTokenExpiry(env.JWT_REFRESH_EXPIRY);

    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: newRefreshToken,
        expiresAt: refreshExpiry,
      },
    });

    const accessExpiry = getTokenExpiry(env.JWT_ACCESS_EXPIRY);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresAt: Math.floor(accessExpiry.getTime() / 1000),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // TODO: Generate reset token and send email
    // For now, just log it
    console.log(`Password reset requested for: ${email}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // TODO: Validate reset token and update password
    throw new BadRequestException('Password reset not implemented yet');
  }

  async getUser(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id: userId },
    });
  }

  private async generateAuthResponse(user: User): Promise<AuthResponse> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    const refreshToken = generateSecureToken();
    const refreshExpiry = getTokenExpiry(env.JWT_REFRESH_EXPIRY);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshExpiry,
      },
    });

    const accessExpiry = getTokenExpiry(env.JWT_ACCESS_EXPIRY);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        avatarUrl: user.avatarUrl,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresAt: Math.floor(accessExpiry.getTime() / 1000),
      },
    };
  }
}

export const authService = new AuthService();
