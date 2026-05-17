// Clerk auth helpers. Use requireUserId() at the top of every server
// action / route handler that needs the signed-in user.

import { auth } from '@clerk/nextjs/server';

/**
 * Returns the Clerk userId or throws "Unauthorized". Throws (not returns
 * null) so server actions can rely on a non-null userId without wrapping
 * every query in if-checks.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

/**
 * Returns the Clerk userId or null. Use in places where unauth is a valid
 * code path (e.g. middleware-bypassed routes, optional rendering).
 */
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
