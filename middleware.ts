import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Public routes — landing + Clerk-rendered auth screens.
const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const { pathname } = req.nextUrl;

  // Authed users hitting the landing or login pages get bounced to /upload —
  // matches the previous Supabase middleware's UX so muscle memory still works.
  if (userId && (pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
    const url = req.nextUrl.clone();
    url.pathname = '/upload';
    return NextResponse.redirect(url);
  }

  // Unauth users hitting protected routes get sent to /login.
  if (!userId && !isPublicRoute(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless found in search params.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
