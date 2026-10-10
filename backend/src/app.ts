import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { requireCsrfHeader } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error';
import { api } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  // HTTPS-only protections are enabled only when served over HTTPS (COOKIE_SECURE),
  // so a store can still run the POS over plain HTTP on its local network.
  const https = env.cookieSecure;
  app.use(
    helmet({
      // Product images are loaded by the SPA from the same origin.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      strictTransportSecurity: https ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          // Allow blob: images for local previews before upload and camera scanning.
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:'],
          'upgrade-insecure-requests': https ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.use('/uploads', express.static(env.uploadDir, { maxAge: '7d', fallthrough: false, dotfiles: 'deny' }));
  app.use('/api', requireCsrfHeader, api);
  app.use('/api', notFoundHandler);

  // In production the backend also serves the built React app.
  if (fs.existsSync(path.join(env.frontendDist, 'index.html'))) {
    app.use(express.static(env.frontendDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
      res.sendFile(path.join(env.frontendDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
