import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, client, createUser, loginAs, prisma, resetDb } from './helpers';

describe('authentication', () => {
  beforeEach(async () => {
    await resetDb();
    await createUser('admin', 'ADMIN');
  });
  afterAll(() => prisma.$disconnect());

  it('logs in with valid credentials and sets an httpOnly session cookie', async () => {
    const c = client();
    const res = await c.post('/api/auth/login', { username: 'admin', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'admin', role: 'ADMIN' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.tokenVersion).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('pos_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('admin');
  });

  it('accepts the username case-insensitively', async () => {
    const res = await client().post('/api/auth/login', { username: 'ADMIN', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with a friendly message', async () => {
    const res = await client().post('/api/auth/login', { username: 'admin', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect username or password.');
  });

  it('rejects unknown users with the same message', async () => {
    const res = await client().post('/api/auth/login', { username: 'ghost', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect username or password.');
  });

  it('rejects deactivated users', async () => {
    await createUser('former', 'CASHIER', 'password123', false);
    const res = await client().post('/api/auth/login', { username: 'former', password: 'password123' });
    expect(res.status).toBe(403);
  });

  it('validates the login payload', async () => {
    const res = await client().post('/api/auth/login', { username: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication for protected endpoints', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered session token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'pos_session=abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('blocks state-changing requests without the CSRF header', async () => {
    const c = await loginAs('admin');
    const res = await c.agent.post('/api/categories').send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('logs out by clearing the cookie', async () => {
    const c = await loginAs('admin');
    await c.post('/api/auth/logout');
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('revokes existing sessions when the password is reset', async () => {
    const admin = await loginAs('admin');
    const cashierUser = await createUser('cashier', 'CASHIER');
    const cashier = await loginAs('cashier');
    expect((await cashier.get('/api/auth/me')).status).toBe(200);

    const reset = await admin.patch(`/api/users/${cashierUser.id}/password`, { password: 'brand-new-pass' });
    expect(reset.status).toBe(200);

    expect((await cashier.get('/api/auth/me')).status).toBe(401);
    await expect(loginAs('cashier', 'brand-new-pass')).resolves.toBeDefined();
  });

  it('records logins in the activity log', async () => {
    await loginAs('admin');
    const log = await prisma.activityLog.findFirst({ where: { action: 'LOGIN' } });
    expect(log?.description).toContain('signed in');
  });
});
