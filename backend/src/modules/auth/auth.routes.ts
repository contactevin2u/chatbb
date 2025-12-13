import { Router } from 'express';
import { z } from 'zod';
import { authService, type RegisterInput, type LoginInput } from './auth.service.js';
import { ValidationException } from '../../shared/exceptions/base.exception.js';

export const authRoutes = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

// POST /api/v1/auth/register - Register new organization + owner
authRoutes.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationException('Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await authService.register(parsed.data as RegisterInput);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/login - Login with email/password
authRoutes.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationException('Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await authService.login(parsed.data as LoginInput);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/refresh - Refresh access token
authRoutes.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationException('Refresh token required');
    }

    const result = await authService.refresh(parsed.data.refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/logout - Logout (revoke refresh token)
authRoutes.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/forgot-password - Request password reset
authRoutes.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationException('Valid email required');
    }

    await authService.forgotPassword(parsed.data.email);
    res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/reset-password - Reset password with token
authRoutes.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationException('Token and password required');
    }

    await authService.resetPassword(parsed.data.token, parsed.data.password);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});
