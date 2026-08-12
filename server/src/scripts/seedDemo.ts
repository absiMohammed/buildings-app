import { Types } from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { Payment } from '../models/Payment.js';
import { UserCredit } from '../models/UserCredit.js';
import { Expense } from '../models/Expense.js';
import { Poll } from '../models/Poll.js';
import { Vote } from '../models/Vote.js';
import { MaintenanceRequest } from '../models/MaintenanceRequest.js';
import { hashPassword } from '../utils/hash.js';
import { logger } from '../config/logger.js';

/**
 * Demo-data seeder. Fills ONE existing building (default: "Olive Tower",
 * override with DEMO_BUILDING=<name>) with a realistic mix of units,
 * residents, payments, expenses, polls (incl. votes) and maintenance
 * tickets so the app reads like a lived-in building.
 *
 * Destructive per building, protective of admins: everything except the
 * building's admins (and their units) is wiped and recreated, so it's
 * safe to re-run. Never run against production.
 */

const BUILDING_NAME = process.env.DEMO_BUILDING ?? 'Olive Tower';
const DEMO_PASSWORD = 'Demo-Pass-123';

const OWNER_NAMES: [string, string][] = [
  ['أحمد', 'خليل'],
  ['سمير', 'حداد'],
  ['ليلى', 'نصار'],
  ['يوسف', 'عودة'],
  ['رنا', 'صالح'],
  ['كمال', 'زيدان'],
  ['هالة', 'قاسم'],
];
const RENTER_NAMES: [string, string][] = [
  ['محمود', 'عابد'],
  ['نور', 'شاهين'],
  ['طارق', 'حمدان'],
];
const DEPENDENT_NAMES: [string, string][] = [
  ['سارة', 'عابد'],
  ['آدم', 'شاهين'],
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main(): Promise<void> {
  await connectDb();

  const building = await Building.findOne({ name: BUILDING_NAME });
  if (!building) {
    logger.error({ name: BUILDING_NAME }, 'Building not found — create it first (or set DEMO_BUILDING).');
    process.exit(1);
  }
  const bid = building._id;

  // ---- Identify what to protect: admins + their units -------------------
  const admins = await User.find({
    memberships: { $elemMatch: { buildingId: bid, isBuildingAdmin: true } },
  });
  const adminIds = admins.map((a) => a._id);
  const adminUnitIds = admins.flatMap((a) =>
    a.memberships
      .filter((m) => String(m.buildingId) === String(bid))
      .flatMap((m) => m.unitIds),
  );
  const admin = admins[0];
  if (!admin) {
    logger.error('No building admin found — seed needs one for createdBy fields.');
    process.exit(1);
  }
  // Non-null capture for closures below (TS narrowing doesn't cross them).
  const adminId = admin._id;

  // ---- Wipe previous demo state -----------------------------------------
  await Promise.all([
    Payment.deleteMany({ buildingId: bid }),
    UserCredit.deleteMany({ buildingId: bid }),
    Expense.deleteMany({ buildingId: bid }),
    Vote.deleteMany({ pollId: { $in: (await Poll.find({ buildingId: bid }).select('_id')).map((p) => p._id) } }),
    MaintenanceRequest.deleteMany({ buildingId: bid }),
  ]);
  await Poll.deleteMany({ buildingId: bid });
  await Unit.deleteMany({ buildingId: bid, _id: { $nin: adminUnitIds } });
  await User.deleteMany({
    systemRole: { $ne: 'admin' },
    _id: { $nin: adminIds },
    memberships: { $elemMatch: { buildingId: bid } },
  });
  logger.info('Wiped previous building data (admins preserved)');

  // ---- Units: 2 per floor across the building's stories ------------------
  const stories = Math.min(building.stories ?? 3, 4); // demo footprint: ≤8 units
  const existingNumbers = new Set(
    (await Unit.find({ buildingId: bid }).select('number')).map((u) => u.number),
  );
  const units = [] as { _id: Types.ObjectId; number: string; floor: number }[];
  for (let f = 1; f <= stories; f++) {
    for (const letter of ['A', 'B']) {
      const number = `${f}${letter}`;
      if (existingNumbers.has(number)) continue;
      const u = await Unit.create({
        buildingId: bid,
        number,
        floor: f,
        monthlyDuesAmount: 300 + f * 25,
        bedrooms: letter === 'A' ? 3 : 2,
        sqft: letter === 'A' ? 1350 : 1080,
      });
      units.push({ _id: u._id, number, floor: f });
    }
  }

  // ---- Residents ----------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let phoneSeq = 100;
  // Sequential numbers, skipping any already taken — seeding a SECOND
  // building must not collide with the first one's residents. Re-runs of the
  // same building free their numbers first (users wiped above), so the same
  // building always gets the same phones back.
  const nextPhone = async () => {
    for (;;) {
      const candidate = `+9705992${String(phoneSeq++).padStart(5, '0')}`;
      if (!(await User.exists({ phone: candidate }))) return candidate;
    }
  };

  interface Resident { id: Types.ObjectId; unit: Types.ObjectId; role: string }
  const residents: Resident[] = [];

  async function createResident(
    [firstName, lastName]: [string, string],
    role: 'owner' | 'renter' | 'dependent',
    unitId: Types.ObjectId,
    linkedOwnerId: Types.ObjectId | null = null,
  ) {
    const u = await User.create({
      phone: await nextPhone(),
      passwordHash,
      firstName,
      lastName,
      systemRole: 'member',
      status: 'active',
      memberships: [{ buildingId: bid, role, unitIds: [unitId], isBuildingAdmin: false, linkedOwnerId }],
    });
    await Unit.updateOne(
      { _id: unitId },
      { $addToSet: { occupants: u._id }, ...(role === 'owner' ? { ownerId: u._id } : {}) },
    );
    residents.push({ id: u._id, unit: unitId, role });
    return u;
  }

  for (let i = 0; i < units.length; i++) {
    const owner = await createResident(OWNER_NAMES[i % OWNER_NAMES.length]!, 'owner', units[i]!._id);
    // Every third unit is tenanted; the first two tenanted units also get a dependent.
    if (i % 3 === 1) {
      const renter = await createResident(RENTER_NAMES[(i / 3) | 0]!, 'renter', units[i]!._id);
      const dep = DEPENDENT_NAMES[(i / 3) | 0];
      if (dep) await createResident(dep, 'dependent', units[i]!._id, owner._id);
      void renter;
    }
  }

  // ---- Payments: 6 months of dues per unit --------------------------------
  const allUnits = await Unit.find({ buildingId: bid });
  const paymentsBatch: Record<string, unknown>[] = [];
  const now = new Date();
  for (const [ui, unit] of allUnits.entries()) {
    const dues = unit.monthlyDuesAmount ?? 350;
    for (let m = 5; m >= 0; m--) {
      const due = new Date(now.getFullYear(), now.getMonth() - m, 1);
      // Current month pending; unit #2 runs one month late; older months paid.
      let status: 'paid' | 'pending' | 'overdue' = 'paid';
      if (m === 0) status = 'pending';
      if (ui === 2 && m === 1) status = 'overdue';
      const ownerId = unit.ownerId ?? admin._id;
      paymentsBatch.push({
        buildingId: bid,
        unitId: unit._id,
        type: 'monthly_dues',
        amount: dues,
        currency: building.currency,
        dueDate: due,
        status,
        // Unit #3's overdue month arrives half-covered so the demo shows a
        // partial payment (receipt history + remaining balance).
        ...(status === 'paid'
          ? {
              paidAt: new Date(due.getTime() + (2 + ui) * 86_400_000),
              paidBy: ownerId,
              paymentMethod: ui % 2 ? 'cash' : 'transfer',
              paidAmount: dues,
            }
          : ui === 2 && m === 1
            ? {
                paidAmount: Math.round(dues / 2),
                receipts: [
                  {
                    amount: Math.round(dues / 2),
                    at: new Date(due.getTime() + 5 * 86_400_000),
                    method: 'cash',
                    recordedBy: adminId,
                    payerId: ownerId,
                  },
                ],
              }
            : { paidAmount: 0 }),
        notes: '',
      });
    }
  }
  // A couple of one-off charges for texture.
  if (allUnits[0]) {
    paymentsBatch.push({
      buildingId: bid,
      unitId: allUnits[0]._id,
      type: 'one_off',
      amount: 150,
      currency: building.currency,
      dueDate: daysAhead(10),
      status: 'pending',
      notes: 'بدل تركيب عدّاد مياه جديد',
    });
  }
  await Payment.insertMany(paymentsBatch);

  // A small prepaid credit for the first owner so the balance auto-apply
  // is visible on the next dues run.
  const firstOwner = residents.find((r) => r.role === 'owner');
  if (firstOwner) {
    await UserCredit.create({
      userId: firstOwner.id,
      buildingId: bid,
      balance: 120,
      currency: building.currency,
    });
  }

  // ---- Expenses ------------------------------------------------------------
  await Expense.insertMany(
    [
      { category: 'cleaning', amount: 450, vendor: 'شركة النظافة الذهبية', description: 'نظافة شهرية للممرات والدرج', incurredAt: daysAgo(75) },
      { category: 'cleaning', amount: 450, vendor: 'شركة النظافة الذهبية', description: 'نظافة شهرية للممرات والدرج', incurredAt: daysAgo(45) },
      { category: 'cleaning', amount: 470, vendor: 'شركة النظافة الذهبية', description: 'نظافة شهرية + جلي بلاط المدخل', incurredAt: daysAgo(15) },
      { category: 'utilities', amount: 620, vendor: 'شركة الكهرباء', description: 'كهرباء الأجزاء المشتركة', incurredAt: daysAgo(30) },
      { category: 'repairs', amount: 850, vendor: 'ورشة أبو رامي', description: 'إصلاح مضخة المياه الرئيسية', incurredAt: daysAgo(22) },
      { category: 'maintenance', amount: 1200, vendor: 'شركة المصاعد الحديثة', description: 'عقد صيانة المصعد — دفعة نصف سنوية', incurredAt: daysAgo(60) },
      { category: 'insurance', amount: 1500, vendor: 'شركة التأمين الوطنية', description: 'تأمين المبنى السنوي', incurredAt: daysAgo(90) },
    ].map((e) => ({ ...e, buildingId: bid, currency: building.currency, splitMode: 'none', createdBy: admin._id })),
  );

  // ---- Polls (with votes) ---------------------------------------------------
  const voters = residents.filter((r) => r.role !== 'dependent');

  async function createPoll(
    title: string,
    description: string,
    options: string[],
    status: 'open' | 'closed',
    closesAt: Date,
    // Vote weights per option index — controls the demo result spread.
    weights: number[],
  ) {
    const poll = await Poll.create({
      buildingId: bid,
      title,
      description,
      options: options.map((text, i) => ({ id: `opt${i + 1}`, text })),
      eligibleRoles: ['owner', 'renter'],
      opensAt: daysAgo(status === 'closed' ? 30 : 5),
      closesAt,
      status,
      createdBy: adminId,
    });
    // ~80% turnout, distributed by the weight table.
    const turnout = voters.filter((_, i) => i % 5 !== 4);
    const total = weights.reduce((s, w) => s + w, 0);
    await Vote.insertMany(
      turnout.map((v, i) => {
        let pick = 0;
        let acc = 0;
        const target = (i * 7919) % total; // deterministic spread, no RNG
        for (let o = 0; o < weights.length; o++) {
          acc += weights[o]!;
          if (target < acc) { pick = o; break; }
        }
        return {
          pollId: poll._id,
          userId: v.id,
          unitId: v.unit,
          optionIds: [`opt${pick + 1}`],
          castAt: daysAgo(status === 'closed' ? 12 : 2),
        };
      }),
    );
    return poll;
  }

  await createPoll(
    'تجديد دهان المدخل والدرج',
    'عرض سعر من ورشة أبو رامي: 2,400 شيكل شاملة المواد. التنفيذ خلال أسبوع.',
    ['موافق — ننفّذ هذا الشهر', 'موافق لكن نؤجل للشهر القادم', 'غير موافق'],
    'open',
    daysAhead(7),
    [5, 2, 1],
  );
  await createPoll(
    'تركيب كاميرات مراقبة إضافية للمواقف',
    'إضافة 4 كاميرات لتغطية مواقف السيارات الخلفية بتكلفة 1,800 شيكل.',
    ['مع التركيب', 'ضد التركيب'],
    'open',
    daysAhead(14),
    [3, 2],
  );
  await createPoll(
    'تغيير شركة النظافة',
    'مقارنة بين البقاء مع الشركة الحالية أو الانتقال لشركة بعرض أفضل.',
    ['البقاء مع الشركة الحالية', 'الانتقال للشركة الجديدة'],
    'closed',
    daysAgo(5),
    [2, 5],
  );

  // ---- Maintenance tickets ---------------------------------------------------
  const someUnit = allUnits[1] ?? allUnits[0];
  const filedBy = residents[0]?.id ?? admin._id;
  await MaintenanceRequest.insertMany([
    {
      buildingId: bid,
      unitId: null,
      filedBy,
      title: 'المصعد يتوقف بين الطابقين الثاني والثالث',
      description: 'يحدث بشكل متكرر صباحاً، وصدر صوت غير طبيعي عند التوقف.',
      category: 'elevator',
      priority: 'urgent',
      status: 'in_progress',
      assignedTo: 'شركة المصاعد الحديثة',
      comments: [
        { userId: admin._id, body: 'تم التواصل مع شركة الصيانة، الفني يصل غداً صباحاً.', createdAt: daysAgo(1) },
      ],
    },
    {
      buildingId: bid,
      unitId: someUnit?._id ?? null,
      filedBy,
      title: 'تسريب ماء أسفل مغسلة المطبخ',
      description: 'التسريب بدأ منذ يومين ويزداد، والخزانة الخشبية تضررت.',
      category: 'plumbing',
      priority: 'high',
      status: 'open',
    },
    {
      buildingId: bid,
      unitId: null,
      filedBy: admin._id,
      title: 'إنارة الطابق الأرضي لا تعمل',
      description: 'اللمبات الثلاث عند المدخل الرئيسي مطفأة.',
      category: 'electrical',
      priority: 'normal',
      status: 'resolved',
      resolvedAt: daysAgo(3),
      resolutionNotes: 'تم تبديل اللمبات الثلاث وفحص الخط.',
    },
    {
      buildingId: bid,
      unitId: null,
      filedBy,
      title: 'باب الطوارئ في السطح لا يُغلق جيداً',
      description: 'الباب يبقى مواربًا مع الهواء القوي.',
      category: 'common_area',
      priority: 'low',
      status: 'open',
    },
  ]);

  const counts = {
    units: await Unit.countDocuments({ buildingId: bid }),
    users: await User.countDocuments({ memberships: { $elemMatch: { buildingId: bid } } }),
    payments: await Payment.countDocuments({ buildingId: bid }),
    expenses: await Expense.countDocuments({ buildingId: bid }),
    polls: await Poll.countDocuments({ buildingId: bid }),
    tickets: await MaintenanceRequest.countDocuments({ buildingId: bid }),
  };
  logger.info({ building: building.name, ...counts }, 'Demo seed complete');
  logger.info(`Demo residents all share the password: ${DEMO_PASSWORD}`);
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'Demo seed failed');
  process.exit(1);
});
