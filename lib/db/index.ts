// Drizzle client backed by @neondatabase/serverless. Use this everywhere
// in app code; do not call neon() directly.

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '@/db/schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
export { schema };
