import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb } from './config/db.js';
import { notFound, errorHandler } from './middleware/error.js';
import { router as apiRouter } from './routes/index.js';
import { startCronJobs } from './jobs/index.js';
import { attachGateWebSocket } from './ws/gateWs.js';
import { attachDoorWebSocket } from './ws/doorWs.js';

async function bootstrap(): Promise<void> {
  await connectDb();

  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV, time: new Date().toISOString() });
  });

  // Tighter limit on auth routes to blunt credential-stuffing / brute force.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Only failed attempts count toward the limit, so a legitimate user
    // logging in repeatedly isn't locked out.
    skipSuccessfulRequests: true,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
  });
  app.use('/api/v1/auth', authLimiter);

  app.use('/api/v1', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  if (env.NODE_ENV !== 'test') {
    startCronJobs();
  }

  const server = createServer(app);
  attachGateWebSocket(server);
  attachDoorWebSocket(server);

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
