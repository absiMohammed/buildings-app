import { Router } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unitIdsOf, type AuthedRequest } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js';
import { Unit } from '../models/Unit.js';
import { Poll } from '../models/Poll.js';
import { MaintenanceRequest } from '../models/MaintenanceRequest.js';
import { User } from '../models/User.js';
import { round2 } from '../services/payments.service.js';
import { Forbidden } from '../utils/errors.js';

export const router = Router();

/**
 * One aggregate call behind the home screen. The client used to fan out to
 * five list endpoints and sum client-side — wrong past GET /payments'
 * limit(500), and heavy on mobile data. Everything money-related is
 * receipts-aware: partial payments count what actually arrived, when it
 * arrived. Backfilled legacy rows carry paidAmount but empty receipts —
 * their collection date comes from paidAt.
 */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const buildingId = new Types.ObjectId(me.buildingId);

    // Building admins see the whole building; residents just their units.
    // ?scope=mine lets a building admin browsing in OWNER view see exactly
    // what a plain owner sees (the view toggle is client-side only — the
    // token still says isBuildingAdmin).
    const wantsMine = (req.query as Record<string, string | undefined>).scope === 'mine';
    const isAdmin = Boolean(me.isBuildingAdmin) && !wantsMine;
    const myUnits = unitIdsOf(me).map((u) => new Types.ObjectId(u));
    const scope: Record<string, unknown> = { buildingId };
    if (!isAdmin) scope.unitId = { $in: myUnits };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      outstandingAgg,
      paidTotalsAgg,
      receiptsByMonth,
      legacyByMonth,
      byTypeAgg,
      nextDue,
      occupiedUnits,
      totalUnits,
      openTickets,
      openPolls,
      pendingClaims,
      activeResidents,
      recentUsers,
    ] = await Promise.all([
      // Open charges: remaining balance + overdue split + units in debt.
      Payment.aggregate<{
        _id: string;
        remaining: number;
        count: number;
        units: Types.ObjectId[];
      }>([
        { $match: { ...scope, status: { $in: ['pending', 'overdue'] } } },
        {
          $group: {
            _id: '$status',
            remaining: { $sum: { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] } },
            count: { $sum: 1 },
            units: { $addToSet: '$unitId' },
          },
        },
      ]),
      // Lifetime money-in and recorded totals (paidAmount is reliable on
      // every row post-backfill).
      Payment.aggregate<{ _id: null; paidTotal: number; totalRecorded: number }>([
        { $match: { ...scope, status: { $ne: 'waived' } } },
        {
          $group: {
            _id: null,
            paidTotal: { $sum: { $ifNull: ['$paidAmount', 0] } },
            totalRecorded: { $sum: '$amount' },
          },
        },
      ]),
      // Money-in by calendar month, from the receipts trail.
      Payment.aggregate<{ _id: { y: number; m: number }; total: number }>([
        { $match: { ...scope, 'receipts.0': { $exists: true } } },
        { $unwind: '$receipts' },
        { $match: { 'receipts.at': { $gte: trendStart } } },
        {
          $group: {
            _id: { y: { $year: '$receipts.at' }, m: { $month: '$receipts.at' } },
            total: { $sum: '$receipts.amount' },
          },
        },
      ]),
      // Legacy fully-paid rows (no receipts): dated by paidAt.
      Payment.aggregate<{ _id: { y: number; m: number }; total: number }>([
        {
          $match: {
            ...scope,
            status: 'paid',
            receipts: { $size: 0 },
            paidAt: { $gte: trendStart, $ne: null },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
            total: { $sum: '$amount' },
          },
        },
      ]),
      // Money-in by charge type, this year (feeds the category donut).
      Payment.aggregate<{ _id: string; total: number }>([
        { $match: { ...scope, createdAt: { $gte: yearStart } } },
        { $group: { _id: '$type', total: { $sum: { $ifNull: ['$paidAmount', 0] } } } },
      ]),
      Payment.findOne({ ...scope, status: { $in: ['pending', 'overdue'] } })
        .sort({ dueDate: 1 })
        .select('amount paidAmount dueDate type status')
        .lean(),
      Unit.countDocuments({ buildingId, occupants: { $exists: true, $ne: [] } }),
      Unit.countDocuments({ buildingId }),
      MaintenanceRequest.countDocuments({
        buildingId,
        status: { $in: ['open', 'in_progress'] },
        ...(isAdmin ? {} : { filedBy: me.sub }),
      }),
      Poll.countDocuments({ buildingId, status: 'open' }),
      Payment.countDocuments({ ...scope, claims: { $elemMatch: { status: 'pending' } } }),
      isAdmin
        ? User.countDocuments({
            memberships: { $elemMatch: { buildingId } },
            status: 'active',
          })
        : Promise.resolve(0),
      isAdmin
        ? User.find({ memberships: { $elemMatch: { buildingId } } })
            .sort({ createdAt: -1 })
            .limit(3)
            .select('firstName lastName phone status memberships.buildingId memberships.role')
            .lean()
        : Promise.resolve([]),
    ]);

    const pendingRow = outstandingAgg.find((r) => r._id === 'pending');
    const overdueRow = outstandingAgg.find((r) => r._id === 'overdue');
    const balance = round2((pendingRow?.remaining ?? 0) + (overdueRow?.remaining ?? 0));
    const unitsWithDebt = new Set(
      [...(pendingRow?.units ?? []), ...(overdueRow?.units ?? [])].map(String)
    ).size;

    // Six trend buckets, oldest first, zero-filled; receipts + legacy merged.
    const monthly = new Map<string, number>();
    for (const r of [...receiptsByMonth, ...legacyByMonth]) {
      const key = `${r._id.y}-${r._id.m}`;
      monthly.set(key, round2((monthly.get(key) ?? 0) + r.total));
    }
    const trend: { year: number; month: number; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      trend.push({ year: d.getFullYear(), month: d.getMonth() + 1, value: monthly.get(key) ?? 0 });
    }
    const collectedMTD = monthly.get(`${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`) ?? 0;
    const paidYTD = round2(
      trend
        .filter((b) => b.year === now.getFullYear())
        .reduce((s, b) => s + b.value, 0)
    );

    const byType: Record<string, number> = {};
    for (const r of byTypeAgg) byType[r._id] = round2(r.total);

    res.json({
      summary: {
        balance,
        overdue: { count: overdueRow?.count ?? 0, amount: round2(overdueRow?.remaining ?? 0) },
        pendingCount: pendingRow?.count ?? 0,
        collectedMTD: round2(collectedMTD),
        paidYTD,
        paidTotal: round2(paidTotalsAgg[0]?.paidTotal ?? 0),
        totalRecorded: round2(paidTotalsAgg[0]?.totalRecorded ?? 0),
        unitsWithDebt,
        occupiedUnits,
        totalUnits,
        activeResidents,
        openTickets,
        openPolls,
        pendingClaims,
        nextDue: nextDue
          ? {
              remaining: round2(nextDue.amount - (nextDue.paidAmount ?? 0)),
              dueDate: nextDue.dueDate,
              type: nextDue.type,
              status: nextDue.status,
            }
          : null,
        trend,
        byType,
        recentUsers: (recentUsers as Array<{
          _id: Types.ObjectId;
          firstName?: string;
          lastName?: string;
          phone?: string;
          status: string;
          memberships?: Array<{ buildingId: Types.ObjectId; role: string }>;
        }>).map((u) => ({
          _id: u._id,
          firstName: u.firstName ?? '',
          lastName: u.lastName ?? '',
          phone: u.phone ?? '',
          status: u.status,
          role: u.memberships?.find((m) => String(m.buildingId) === me.buildingId)?.role ?? 'owner',
        })),
      },
    });
  })
);
