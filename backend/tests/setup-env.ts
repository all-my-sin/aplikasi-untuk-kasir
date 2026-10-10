// Runs before each test file (before the app is imported): point at the test DB.
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env (see .env.example).');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-1234';
