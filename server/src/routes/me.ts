import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { NotFound } from '../utils/errors.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { toUserPayload } from '../services/capabilities.service.js';

export const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await User.findById((req as AuthedRequest).user.sub);
    if (!user) throw NotFound('User not found');
    res.json({ user: await toUserPayload(user) });
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
    res.json({ user: await toUserPayload(user) });
  })
);
