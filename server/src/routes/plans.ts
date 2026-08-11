import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, ownBuildingId } from '../middleware/auth.js';
import { Building } from '../models/Building.js';
import { PLANS, TRIAL_DAYS, trialDaysLeft } from '../services/plans.service.js';
import { NotFound } from '../utils/errors.js';

export const router = Router();

/** Plan catalog — ids, store product ids, display prices, limits, modules.
 *  Building-admin only: subscriptions are invisible to every other role. */
router.get(
  '/',
  requireBuildingAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ plans: Object.values(PLANS), trialDays: TRIAL_DAYS });
  })
);

const subscribeSchema = z.object({
  plan: z.enum(['basic', 'pro', 'premium']),
  platform: z.enum(['ios', 'android', 'manual']).default('manual'),
  productId: z.string().max(200).optional(),
  transactionId: z.string().max(200).optional(),
});

/**
 * Activate a plan for the caller's building after an in-app purchase.
 * Reactivates a suspended building (this endpoint is on the suspended
 * allow-list precisely so a lapsed admin can pay their way back in).
 *
 * TODO(iap): verify the receipt server-side against Apple/Google before
 * trusting it. Until store credentials are configured we record the
 * client-reported transaction as-is.
 */
router.post(
  '/subscribe',
  requireBuildingAdmin,
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    const buildingId = ownBuildingId(req);
    const body = req.body as z.infer<typeof subscribeSchema>;
    const building = await Building.findById(buildingId);
    if (!building) throw NotFound('Building not found');

    const plan = PLANS[body.plan];
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    building.set('subscription', {
      plan: body.plan,
      status: 'active',
      trialEndsAt: building.subscription?.trialEndsAt ?? null,
      currentPeriodEnd: periodEnd,
      iap: {
        platform: body.platform,
        productId: body.productId ?? plan.productId,
        transactionId: body.transactionId ?? '',
        lastPurchaseAt: new Date(),
      },
    });
    building.status = 'active';
    await building.save();

    res.json({
      building: {
        _id: String(building._id),
        status: building.status,
        subscription: {
          plan: building.subscription?.plan,
          status: building.subscription?.status,
          currentPeriodEnd: building.subscription?.currentPeriodEnd,
          trialDaysLeft: trialDaysLeft(building),
        },
      },
    });
  })
);
