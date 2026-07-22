import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { NotFound } from '../utils/errors.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { toUserPayload } from '../services/capabilities.service.js';
import { changePassword } from '../services/auth.service.js';

export const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const user = await User.findById(me.sub);
    if (!user) throw NotFound('User not found');
    res.json({ user: await toUserPayload(user, me.buildingId) });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post(
  '/password',
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const me = (req as AuthedRequest).user;
    const tokens = await changePassword(me.sub, currentPassword, newPassword, me.buildingId);
    // Return a fresh session so the caller stays logged in after the change.
    res.json({ ok: true, ...tokens });
  })
);

const updateMeSchema = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
});

router.patch(
  '/',
  validate(updateMeSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      (req as AuthedRequest).user.sub,
      req.body,
      { new: true }
    );
    if (!user) throw NotFound('User not found');
    res.json({ user: await toUserPayload(user, (req as AuthedRequest).user.buildingId) });
  })
);
