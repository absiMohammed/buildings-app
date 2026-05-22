import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { router as authRouter } from './auth.js';
import { router as meRouter } from './me.js';
import { router as invitesRouter } from './invites.js';
import { router as usersRouter } from './users.js';
import { router as unitsRouter } from './units.js';
import { router as expensesRouter } from './expenses.js';
import { router as paymentsRouter } from './payments.js';
import { router as pollsRouter } from './polls.js';
import { router as maintenanceRouter } from './maintenance.js';
import { router as documentsRouter } from './documents.js';
import { router as notificationsRouter } from './notifications.js';
import { router as buildingsRouter } from './buildings.js';
import { router as gateRouter } from './gate.js';
import { router as doorRouter } from './door.js';

export const router = Router();

router.use('/auth', authRouter);

// All other routes require auth
router.use(authenticate);

router.use('/me', meRouter);
router.use('/invites', invitesRouter);
router.use('/users', usersRouter);
router.use('/units', unitsRouter);
router.use('/expenses', expensesRouter);
router.use('/payments', paymentsRouter);
router.use('/polls', pollsRouter);
router.use('/maintenance', maintenanceRouter);
router.use('/documents', documentsRouter);
router.use('/notifications', notificationsRouter);
router.use('/buildings', buildingsRouter);
router.use('/gate', gateRouter);
router.use('/door', doorRouter);
