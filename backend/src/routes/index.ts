import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../lib/errors';
import { authenticate, requireAdmin } from '../middleware/auth';
import * as admin from '../controllers/admin.controller';
import * as auth from '../controllers/auth.controller';
import * as categories from '../controllers/categories.controller';
import * as inventory from '../controllers/inventory.controller';
import * as products from '../controllers/products.controller';
import * as reports from '../controllers/reports.controller';
import * as transactions from '../controllers/transactions.controller';

// Brute-force protection: 10 failed logins per 15 minutes per IP + username.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.username ?? '').toLowerCase()}`,
  handler: (_req, res) =>
    res.status(429).json({
      error: { message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.', code: 'RATE_LIMITED' },
    }),
});

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    // Random server-side names: never trust the client's filename.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest('Only PNG, JPG, WEBP or GIF images are allowed.'));
  },
});

export const api = Router();

// ---------------------------------------------------------------- public
api.get('/health', (_req, res) => res.json({ ok: true }));
api.post('/auth/login', loginLimiter, auth.login);
api.post('/auth/logout', auth.logout);

// ---------------------------------------------------------------- authenticated (any role)
api.use(authenticate);

api.get('/auth/me', auth.me);
api.get('/settings', admin.getSettings);

api.get('/products', products.list);
api.get('/products/lookup', products.lookup);
api.get('/products/export', requireAdmin, products.exportCsv);
api.get('/products/:id', products.get);
api.get('/categories', categories.list);

api.get('/transactions', transactions.list);
api.post('/transactions', transactions.create);
api.get('/transactions/:id', transactions.get);

// ---------------------------------------------------------------- admin only
api.post('/products', requireAdmin, products.create);
api.post('/products/import', requireAdmin, products.importCsv);
api.put('/products/:id', requireAdmin, products.update);
api.delete('/products/:id', requireAdmin, products.archive);

api.post('/categories', requireAdmin, categories.create);
api.put('/categories/:id', requireAdmin, categories.update);
api.delete('/categories/:id', requireAdmin, categories.remove);

api.get('/inventory', requireAdmin, inventory.list);
api.post('/inventory/adjustments', requireAdmin, inventory.adjust);
api.post('/inventory/opname', requireAdmin, inventory.opname);
api.get('/inventory/movements', requireAdmin, inventory.movements);

api.post('/transactions/:id/void', requireAdmin, transactions.voidTransaction);

api.get('/reports/dashboard', requireAdmin, reports.dashboard);
api.get('/reports/sales', requireAdmin, reports.sales);
api.get('/reports/profit', requireAdmin, reports.profit);
api.get('/reports/products', requireAdmin, reports.products);
api.get('/reports/export', requireAdmin, reports.exportReport);

api.get('/users', requireAdmin, admin.listUsers);
api.get('/users/options', requireAdmin, admin.userOptions);
api.post('/users', requireAdmin, admin.createUser);
api.put('/users/:id', requireAdmin, admin.updateUser);
api.patch('/users/:id/status', requireAdmin, admin.setUserStatus);
api.patch('/users/:id/password', requireAdmin, admin.resetPassword);

api.put('/settings', requireAdmin, admin.updateSettings);
api.post('/uploads', requireAdmin, upload.single('file'), admin.uploadImage);
api.get('/activity-logs', requireAdmin, admin.activityLogs);
