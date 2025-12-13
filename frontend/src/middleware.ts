import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if we have auth tokens in cookies
  const authStorage = request.cookies.get('auth-storage');
  let hasTokens = false;

  if (authStorage?.value) {
    try {
      const parsed = JSON.parse(authStorage.value);
      hasTokens = !!parsed?.state?.tokens?.accessToken;
    } catch {
      hasTokens = false;
    }
  }

  // If on auth pages and already authenticated, redirect to dashboard
  if (authPaths.includes(pathname) && hasTokens) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If on protected pages and not authenticated, redirect to login
  if (!publicPaths.includes(pathname) && !hasTokens) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
  ],
};
