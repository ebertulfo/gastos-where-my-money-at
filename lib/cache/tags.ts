/**
 * Cache-tag builders. Read paths use these to register dependencies via
 * `unstable_cache({ tags: [...] })`; write paths invalidate via
 * `revalidateTag(...)`. Keep both sides referencing the same builder so a
 * rename in one place fixes both.
 */

export const tag = {
  /** Anything derived from rows in `transactions` for this user (months, years, summaries, insights). */
  tx: (userId: string) => `tx:${userId}`,
  /** The user's `statements` list / metadata. */
  statements: (userId: string) => `statements:${userId}`,
  /** The user's household member roster. */
  members: (userId: string) => `members:${userId}`,
  /** The user's labels (kind = 'label'). */
  tags: (userId: string) => `labels:${userId}`,
  /** The user's categories (kind = 'category'). */
  categories: (userId: string) => `categories:${userId}`,
}
