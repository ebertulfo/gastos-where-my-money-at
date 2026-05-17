// drizzle-kit config — used for `drizzle-kit introspect` to regenerate
// db/schema.ts from a live Neon DB. Day-to-day app code does not depend
// on this file.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
