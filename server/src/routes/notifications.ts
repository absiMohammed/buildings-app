import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';

export const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const { unread } = req.query as { unread?: string };
    const filter: Record<string, unknown> = { userId: me.sub };
    if (unread === 'true') filter.read = false;
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ notifications });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: me.sub },
      { read: true, readAt: new Date() },
      { new: true }
    );
    res.json({ notification: n });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const result = await Notification.updateMany(
      { userId: me.sub, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ updated: result.modifiedCount });
  })
);
