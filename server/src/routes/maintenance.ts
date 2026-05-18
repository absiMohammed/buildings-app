import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireRole, type AuthedRequest } from '../middleware/auth.js';
import { MaintenanceRequest } from '../models/MaintenanceRequest.js';
import { NotFound, Forbidden } from '../utils/errors.js';

export const router = Router();

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  category: z.enum(['plumbing', 'electrical', 'elevator', 'common_area', 'other']).default('other'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  unitId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().max(200).optional(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(4000).optional(),
  resolutionNotes: z.string().max(2000).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    if (me.role !== 'admin') {
      filter.$or = [{ unitId: me.unitId ?? null }, { unitId: null }, { filedBy: me.sub }];
    }
    const requests = await MaintenanceRequest.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ requests });
  })
);

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof createSchema>;
    const request = await MaintenanceRequest.create({
      buildingId: me.buildingId,
      filedBy: me.sub,
      unitId: body.unitId ?? (me.unitId ?? null),
      title: body.title,
      description: body.description ?? '',
      category: body.category,
      priority: body.priority,
    });
    res.status(201).json({ request });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const request = await MaintenanceRequest.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!request) throw NotFound();
    res.json({ request });
  })
);

router.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof updateSchema>;
    const request = await MaintenanceRequest.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!request) throw NotFound();

    const isAdmin = me.role === 'admin';
    const isFiler = request.filedBy.toString() === me.sub;

    if (!isAdmin && !isFiler) throw Forbidden();

    if (isAdmin) {
      if (body.status) {
        request.status = body.status;
        if (body.status === 'resolved') request.resolvedAt = new Date();
      }
      if (body.priority) request.priority = body.priority;
      if (body.assignedTo !== undefined) request.assignedTo = body.assignedTo;
      if (body.resolutionNotes !== undefined) request.resolutionNotes = body.resolutionNotes;
    }
    if (isFiler && (request.status === 'open' || request.status === 'in_progress')) {
      if (body.title) request.title = body.title;
      if (body.description !== undefined) request.description = body.description;
    }
    await request.save();
    res.json({ request });
  })
);

const commentSchema = z.object({ body: z.string().min(1).max(2000) });

router.post(
  '/:id/comments',
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const request = await MaintenanceRequest.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!request) throw NotFound();

    // Only admin, the filer, or a current occupant of the affected unit may
    // comment. Requests with a null unitId (building common-area issues) are
    // open to all building members.
    const isAdmin = me.role === 'admin';
    const isFiler = request.filedBy.toString() === me.sub;
    const isCommonArea = request.unitId === null || request.unitId === undefined;
    const isSameUnit =
      !!me.unitId && !!request.unitId && request.unitId.toString() === me.unitId;
    if (!isAdmin && !isFiler && !isCommonArea && !isSameUnit) throw Forbidden();

    request.comments.push({
      userId: me.sub as unknown as typeof request.comments[number]['userId'],
      body: (req.body as { body: string }).body,
      createdAt: new Date(),
    });
    await request.save();
    res.status(201).json({ request });
  })
);
