import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { Payment } from '../models/Payment.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { sendWhatsApp } from './whatsapp.service.js';

export async function generateMonthlyDues(buildingId: string) {
  const building = await Building.findById(buildingId);
  if (!building) return { generated: 0 };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const defaultDay = building.settings?.monthlyDuesDay ?? 1;
  const defaultAmount = building.settings?.defaultMonthlyDues ?? 0;

  const units = await Unit.find({ buildingId });

  let generated = 0;
  for (const unit of units) {
    // Per-unit overrides take precedence; falls back to building defaults.
    const day = unit.monthlyDuesDayOverride ?? defaultDay;
    const dueDate = new Date(year, month, day);
    const startOfMonth = new Date(year, month, 1);
    const startOfNextMonth = new Date(year, month + 1, 1);

    // Owner-set rent: billed monthly alongside dues, but only while a renter
    // actually occupies the unit. The owner settles these charges directly.
    const rentAmount = unit.monthlyRentAmount ?? 0;
    if (rentAmount > 0) {
      const hasRenter = await User.exists({
        memberships: { $elemMatch: { unitIds: unit._id, role: 'renter' } },
        status: { $in: ['active', 'invited'] },
      });
      const existingRent = hasRenter
        ? await Payment.findOne({
            unitId: unit._id,
            type: 'rent',
            dueDate: { $gte: startOfMonth, $lt: startOfNextMonth },
          })
        : null;
      if (hasRenter && !existingRent) {
        await Payment.create({
          buildingId,
          unitId: unit._id,
          type: 'rent',
          amount: rentAmount,
          currency: building.currency,
          dueDate,
          status: 'pending',
        });
        generated++;
      }
    }

    const amount = unit.monthlyDuesAmount ?? defaultAmount;
    if (!amount || amount <= 0) continue; // nothing billable
    const existing = await Payment.findOne({
      unitId: unit._id,
      type: 'monthly_dues',
      dueDate: { $gte: startOfMonth, $lt: startOfNextMonth },
    });
    if (existing) continue;
    await Payment.create({
      buildingId,
      unitId: unit._id,
      type: 'monthly_dues',
      amount,
      currency: building.currency,
      dueDate,
      status: 'pending',
    });
    generated++;

    // Notify occupants
    if (unit.occupants && unit.occupants.length > 0) {
      const occupants = await User.find({ _id: { $in: unit.occupants }, status: 'active' });
      const title = `Monthly dues for ${month + 1}/${year}`;
      const body = `Amount due: ${building.currency} ${amount.toFixed(2)} by ${dueDate.toDateString()}`;
      for (const u of occupants) {
        await Notification.create({
          userId: u._id,
          buildingId,
          type: 'payment_due',
          title,
          body,
          link: `/payments`,
        });
        // Mirror the reminder over WhatsApp (no-ops if WhatsApp isn't configured).
        await sendWhatsApp(u.phone, `${building.name}: ${title}. ${body}`);
      }
    }
  }
  return { generated };
}

export async function markOverduePayments(buildingId: string) {
  const building = await Building.findById(buildingId);
  if (!building) return { marked: 0 };
  const grace = building.settings?.lateFee?.gracePeriodDays ?? 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - grace);
  const res = await Payment.updateMany(
    { buildingId, status: 'pending', dueDate: { $lt: cutoff } },
    { status: 'overdue' }
  );
  return { marked: res.modifiedCount };
}
