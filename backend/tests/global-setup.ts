// Creates the test database (if needed) and applies all migrations once per run.
import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

export default async function setup() {
  dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });
  const testUrl = process.env.TEST_DATABASE_URL;
  const mainUrl = process.env.DATABASE_URL;
  if (!testUrl || !mainUrl) throw new Error('DATABASE_URL and TEST_DATABASE_URL must be set in .env');
  if (testUrl === mainUrl) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — tests wipe the database!');

  const dbName = new URL(testUrl).pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Unsupported test database name: ${dbName}`);
  const admin = new PrismaClient({ datasourceUrl: mainUrl });
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
