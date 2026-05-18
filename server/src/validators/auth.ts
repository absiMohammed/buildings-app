import { z } from 'zod';

export const loginSchema = z
  .object({
    identifier: z.string().min(3).max(120).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((d) => Boolean(d.identifier || d.email), {
    message: 'identifier (email or mobile) is required',
    path: ['identifier'],
  });

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().max(40).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const inviteSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(4).max(40).optional(),
    // `admin` is intentionally excluded: admin role is only reachable by
    // promoting an existing owner (PATCH /users/:id/role), never via invite.
    role: z.enum(['owner', 'renter', 'dependent']),
    unitId: z.string().optional().nullable(),
    // System admin invites users into a specific building, since they
    // have no home building of their own. Required when the caller is admin;
    // ignored for any other role (the route picks `me.buildingId` instead).
    buildingId: z.string().optional(),
    // System-admin-only: flag the invited owner as this building's admin.
    // Server-side checks (a) caller is admin, (b) role === 'owner', and
    // (c) no other building admin exists for the target building.
    isBuildingAdmin: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'email or phone is required',
    path: ['email'],
  });
