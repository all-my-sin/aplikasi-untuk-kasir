import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Walks up from this file to the monorepo root (the folder holding prisma/schema.prisma). */
function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const ROOT_DIR = process.env.APP_ROOT ?? findRoot();

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const boolish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (see .env.example)'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: boolish,
  UPLOAD_DIR: z.string().default('uploads'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: boolish,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast with a readable message instead of a cryptic runtime error later.
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  cookieSecure: raw.COOKIE_SECURE ?? raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  uploadDir: path.resolve(ROOT_DIR, raw.UPLOAD_DIR),
  frontendDist: path.join(ROOT_DIR, 'frontend', 'dist'),
};
