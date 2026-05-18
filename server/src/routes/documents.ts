import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, type AuthedRequest } from '../middleware/auth.js';
import { DocumentModel } from '../models/Document.js';
import { env } from '../config/env.js';
import { NotFound, Forbidden } from '../utils/errors.js';

export const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(env.STORAGE_LOCAL_DIR, { recursive: true });
      cb(null, env.STORAGE_LOCAL_DIR);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const metaSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(['bylaws', 'meeting_minutes', 'notice', 'contract', 'other']).default('other'),
  visibility: z.enum(['all', 'owners_only', 'admin_only']).default('all'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    if (me.role !== 'admin') {
      const allowed = me.role === 'owner' ? ['all', 'owners_only'] : ['all'];
      filter.visibility = { $in: allowed };
    }
    const docs = await DocumentModel.find(filter).sort({ createdAt: -1 });
    res.json({ documents: docs });
  })
);

router.post(
  '/',
  requireBuildingAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const meta = metaSchema.parse(req.body);
    const file = req.file;
    if (!file) throw Forbidden('No file');
    const doc = await DocumentModel.create({
      buildingId: me.buildingId,
      title: meta.title,
      description: meta.description ?? '',
      category: meta.category,
      visibility: meta.visibility,
      fileUrl: `/uploads/${path.basename(file.path)}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: me.sub,
    });
    res.status(201).json({ document: doc });
  })
);

router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const doc = await DocumentModel.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!doc) throw NotFound();
    if (
      doc.visibility === 'admin_only' && me.role !== 'admin'
      || (doc.visibility === 'owners_only' && me.role !== 'admin' && me.role !== 'owner')
    ) {
      throw Forbidden();
    }
    const filePath = path.join(env.STORAGE_LOCAL_DIR, path.basename(doc.fileUrl));
    res.download(filePath, doc.title);
  })
);

router.delete(
  '/:id',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const doc = await DocumentModel.findOneAndDelete({ _id: req.params.id, buildingId: me.buildingId });
    if (doc) {
      const filePath = path.join(env.STORAGE_LOCAL_DIR, path.basename(doc.fileUrl));
      await fs.unlink(filePath).catch(() => undefined);
    }
    res.status(204).end();
  })
);
