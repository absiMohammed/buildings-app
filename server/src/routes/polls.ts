import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { Poll } from '../models/Poll.js';
import { Vote } from '../models/Vote.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { sendWhatsApp } from '../services/whatsapp.service.js';
import { Forbidden, NotFound, BadRequest } from '../utils/errors.js';

export const router = Router();

const createPollSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  options: z.array(z.object({ text: z.string().min(1).max(200) })).min(2).max(20),
  eligibleRoles: z.array(z.enum(['admin', 'owner', 'renter', 'dependent'])).default(['owner']),
  allowMultiple: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date(),
});

const voteSchema = z.object({
  optionIds: z.array(z.string()).min(1),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const polls = await Poll.find({ buildingId: me.buildingId }).sort({ createdAt: -1 });
    res.json({ polls });
  })
);

router.post(
  '/',
  validate(createPollSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (me.role !== 'admin' && me.role !== 'owner') throw Forbidden('Only admin or owner can create polls');
    const body = req.body as z.infer<typeof createPollSchema>;
    const now = new Date();
    const opensAt = body.opensAt ?? now;
    const status = opensAt <= now ? 'open' : 'draft';
    const poll = await Poll.create({
      buildingId: me.buildingId,
      title: body.title,
      description: body.description ?? '',
      options: body.options.map((o) => ({ id: crypto.randomUUID(), text: o.text })),
      eligibleRoles: body.eligibleRoles,
      allowMultiple: body.allowMultiple,
      anonymous: body.anonymous,
      opensAt,
      closesAt: body.closesAt,
      status,
      createdBy: me.sub,
    });

    // Notify eligible residents when the poll opens immediately.
    if (status === 'open' && me.buildingId) {
      const recipients = await User.find({
        buildingId: me.buildingId,
        status: 'active',
        role: { $in: body.eligibleRoles },
      });
      const waBody = `${poll.title} — a new poll is open for your vote. Closes ${new Date(body.closesAt).toDateString()}.`;
      for (const u of recipients) {
        await Notification.create({
          userId: u._id,
          buildingId: me.buildingId,
          type: 'poll_open',
          title: 'New poll open',
          body: poll.title,
          link: `/polls`,
        });
        await sendWhatsApp(u.phone, waBody);
      }
    }

    res.status(201).json({ poll });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const poll = await Poll.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!poll) throw NotFound('Poll not found');

    const myVote = await Vote.findOne({ pollId: poll._id, userId: me.sub });
    // Live tallies are visible once the viewer can no longer be swayed by
    // them: closed polls for everyone, open polls for building admins and
    // for residents who already cast their ballot.
    const canSeeTallies =
      poll.status === 'closed' || me.isBuildingAdmin || me.role === 'admin' || !!myVote;
    let tallies: Record<string, number> | undefined;
    if (canSeeTallies) {
      const all = await Vote.find({ pollId: poll._id });
      tallies = {};
      for (const opt of poll.options) tallies[opt.id] = 0;
      for (const v of all) for (const id of v.optionIds) tallies[id] = (tallies[id] ?? 0) + 1;
    }
    res.json({ poll, myVote, tallies });
  })
);

router.post(
  '/:id/vote',
  validate(voteSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const poll = await Poll.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!poll) throw NotFound('Poll not found');
    if (poll.status !== 'open') throw BadRequest('Poll is not open');
    // 'independent' (staff) is never in a poll's eligibleRoles, so the cast is
    // safe — the check simply returns false and voting is forbidden for them.
    if (!poll.eligibleRoles.includes(me.role as (typeof poll.eligibleRoles)[number])) {
      throw Forbidden('You cannot vote on this poll');
    }

    const { optionIds } = req.body as { optionIds: string[] };
    if (!poll.allowMultiple && optionIds.length !== 1)
      throw BadRequest('Only one option allowed');
    const valid = new Set(poll.options.map((o) => o.id));
    for (const id of optionIds) if (!valid.has(id)) throw BadRequest(`Unknown option: ${id}`);

    await Vote.findOneAndUpdate(
      { pollId: poll._id, userId: me.sub },
      { optionIds, castAt: new Date(), unitId: me.unitId ?? null },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  })
);

router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (me.role !== 'admin') throw Forbidden();
    const poll = await Poll.findOneAndUpdate(
      { _id: req.params.id, buildingId: me.buildingId },
      { status: 'closed' },
      { new: true }
    );
    if (!poll) throw NotFound('Poll not found');
    res.json({ poll });
  })
);
