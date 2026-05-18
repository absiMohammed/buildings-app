import type { RequestHandler } from 'express';
import { ZodSchema } from 'zod';

export const validate =
  (schema: ZodSchema, where: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const target = (req as unknown as Record<string, unknown>)[where];
    const result = schema.safeParse(target);
    if (!result.success) {
      next(result.error);
      return;
    }
    (req as unknown as Record<string, unknown>)[where] = result.data;
    next();
  };
