# Building Management App — Architecture & Spec

**Stack:** MongoDB, Express, React, Node.js (MERN)
**Date:** 2026-05-10
**Author:** Mohammed Absi

---

## 1. Product Overview

A residential building management platform that lets a single building (yours, to start) coordinate finances, governance, maintenance, and communications. The app is multi-tenant-ready by design (one Building document per building), but v1 targets a single building.

### Goals
- Give the **admin** (building manager / committee) one place to track expenses, dues, votes, and maintenance.
- Give **owners** visibility into their unit's financial standing and a voice in governance via polls.
- Let **renters** see relevant info (announcements, maintenance, their dues if applicable) without governance privileges.
- Let **dependents** (family members of the owner — spouse, adult children) see most info read-only.

### Non-goals (v1)
- Multi-building portfolios, public marketplace, accounting-grade GL, mobile native apps.

---

## 2. User Roles & Permissions

### Roles

| Role | Who | Linked To |
|------|-----|-----------|
| `admin` | Building manager / committee chair | Building |
| `owner` | Unit owner (head-of-unit) | Unit (1 owner per unit in v1) |
| `renter` | Tenant renting the unit from the owner | Unit, via owner |
| `dependent` | Spouse / adult family of owner | Unit, via owner |

### Permission Matrix

| Capability | Admin | Owner | Renter | Dependent |
|---|---|---|---|---|
| View building expenses | ✅ | ✅ | ✅ | ✅ |
| Create/edit expenses | ✅ | ❌ | ❌ | ❌ |
| View own unit's payments | ✅ (all units) | ✅ | ✅ | ✅ |
| Mark payment received | ✅ | ❌ | ❌ | ❌ |
| Pay own dues | n/a | ✅ | ✅ (if assigned) | ❌ |
| Create poll | ✅ | ✅ (some types) | ❌ | ❌ |
| Vote in poll | n/a | ✅ | ❌ | ❌ |
| File maintenance request | ✅ | ✅ | ✅ | ✅ |
| Resolve maintenance request | ✅ | ❌ | ❌ | ❌ |
| Upload documents | ✅ | ❌ | ❌ | ❌ |
| View documents | ✅ | ✅ | ✅ | ✅ |
| Invite users | ✅ (any role) | ✅ (renter/dependent only, in own unit) | ❌ | ❌ |
| Edit unit details | ✅ | ✅ (limited) | ❌ | ❌ |

> Voting is restricted to **owners** in v1. Configurable per-poll later (e.g. "all residents may vote" for non-financial polls).

---

## 3. Data Models (MongoDB / Mongoose)

### 3.1 Building
```js
{
  _id, name, address, currency: "USD",
  createdAt, updatedAt,
  settings: {
    monthlyDuesDay: 1,           // day of month dues are issued
    lateFeePolicy: { gracePeriodDays, lateFeeAmount, lateFeePercent },
    timezone: "America/New_York"
  }
}
```

### 3.2 Unit
```js
{
  _id, buildingId,
  number: "3B",                  // human-friendly identifier
  floor, sqft, bedrooms,
  monthlyDuesAmount,             // base dues for this unit
  ownerId,                       // ref User (role=owner)
  occupants: [userId],           // owner + renters + dependents currently linked
  notes,
  createdAt, updatedAt
}
```

### 3.3 User
```js
{
  _id, email (unique), passwordHash,
  firstName, lastName, phone,
  role: "admin" | "owner" | "renter" | "dependent",
  buildingId,
  unitId,                        // null for admin
  linkedOwnerId,                 // for renter/dependent — who invited them
  status: "invited" | "active" | "suspended",
  inviteToken, inviteExpiresAt,  // null after activation
  lastLoginAt,
  createdAt, updatedAt
}
```

### 3.4 Expense (building-wide)
```js
{
  _id, buildingId,
  category: "maintenance" | "utilities" | "repairs" | "cleaning" | "insurance" | "other",
  amount, currency,
  description,
  vendor,
  incurredAt,                    // date the expense was incurred
  receiptUrl,                    // S3/local
  splitMode: "equal" | "by_sqft" | "by_unit_pct" | "none",
  // if splitMode is set, the system can auto-generate per-unit charges
  createdBy,                     // admin userId
  createdAt, updatedAt
}
```

### 3.5 Payment (per-unit monthly dues / expense splits)
```js
{
  _id, buildingId, unitId,
  type: "monthly_dues" | "expense_split" | "one_off",
  amount, currency,
  dueDate,
  status: "pending" | "paid" | "overdue" | "waived",
  paidAt, paidBy,                // userId who marked / paid
  paymentMethod: "cash" | "transfer" | "stripe" | "other",
  externalRef,                   // bank ref, Stripe charge id, etc.
  expenseId,                     // if generated from an Expense split
  notes,
  createdAt, updatedAt
}
```

### 3.6 Poll
```js
{
  _id, buildingId,
  title, description,
  options: [{ id, text }],
  eligibleRoles: ["owner"],      // who can vote
  allowMultiple: false,
  anonymous: false,
  opensAt, closesAt,
  status: "draft" | "open" | "closed",
  createdBy,
  createdAt, updatedAt
}
```

### 3.7 Vote
```js
{
  _id, pollId, userId, unitId,
  optionIds: [String],
  castAt
}
// unique index: (pollId, userId)
```

### 3.8 MaintenanceRequest
```js
{
  _id, buildingId, unitId,       // unitId null if common-area
  filedBy,                       // userId
  title, description,
  category: "plumbing" | "electrical" | "elevator" | "common_area" | "other",
  priority: "low" | "normal" | "high" | "urgent",
  status: "open" | "in_progress" | "resolved" | "closed",
  assignedTo,                    // admin or vendor name
  attachments: [url],
  comments: [{ userId, body, createdAt }],
  resolvedAt, resolutionNotes,
  createdAt, updatedAt
}
```

### 3.9 Document
```js
{
  _id, buildingId,
  title, description,
  category: "bylaws" | "meeting_minutes" | "notice" | "contract" | "other",
  fileUrl, mimeType, sizeBytes,
  visibility: "all" | "owners_only" | "admin_only",
  uploadedBy,
  createdAt
}
```

### 3.10 Notification
```js
{
  _id, userId,
  type: "payment_due" | "payment_overdue" | "poll_open" | "announcement" | "maintenance_update",
  title, body,
  link,                          // in-app deep link
  read: false, readAt,
  createdAt
}
```

### 3.11 InviteToken (separate collection for audit; can also live on User)
```js
{
  _id, email, role, unitId, invitedBy,
  token (hashed), expiresAt, usedAt,
  createdAt
}
```

### Indexes (key ones)
- `User.email` unique
- `User.buildingId + role`
- `Unit.buildingId + number` unique
- `Payment.unitId + dueDate`
- `Payment.status + dueDate` (for overdue scans)
- `Vote.pollId + userId` unique
- `Notification.userId + read + createdAt`

---

## 4. Authentication & Invites

**Approach:** JWT + admin-invite-only (no public signup).

### Flow
1. **Admin bootstrap.** Seed script creates the first admin account and the Building document.
2. **Admin invites owner.** Admin enters email + assigns to a unit. System creates a `User` row with `status: "invited"` and an `InviteToken`. Email sent with a magic link `https://app/invite/accept?token=...`.
3. **Owner accepts.** Sets password, status flips to `active`. JWT issued.
4. **Owner invites renter/dependent.** Same mechanic, scoped to owner's own unit. Owner can only invite roles `renter` or `dependent`.
5. **Login.** Email + password → JWT (access token, ~15 min) + refresh token (~30 days, httpOnly cookie).
6. **Password reset.** Email with one-time token, 1-hour expiry.

### JWT Payload
```json
{ "sub": "userId", "role": "owner", "buildingId": "...", "unitId": "...", "iat": ..., "exp": ... }
```

### Middleware stack (server)
- `authenticate` — verifies JWT, attaches `req.user`.
- `requireRole(...roles)` — gate by role.
- `requireSameUnit` — for unit-scoped endpoints; rejects cross-unit access.
- `requireBuilding` — every authenticated request scoped to `req.user.buildingId`.

### Security
- Bcrypt (cost 12) for passwords.
- Refresh tokens stored hashed in DB; revocable on logout / role change.
- Rate limit on `/auth/*` (express-rate-limit).
- Helmet, CORS allowlist, input validation via Zod or Joi.
- No PII in logs.

---

## 5. REST API Surface (v1)

Base path: `/api/v1`. All routes (except auth) require JWT.

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/invite/accept` { token, password }
- `POST /auth/forgot-password` / `POST /auth/reset-password`

### Users & Invites
- `GET /me`
- `PATCH /me`
- `POST /invites` (admin: any role; owner: renter/dependent in own unit)
- `GET /invites` (admin sees all; owner sees own unit's)
- `DELETE /invites/:id` (revoke)
- `GET /users` (admin)
- `PATCH /users/:id/status` (admin: suspend/reactivate)

### Units
- `GET /units` (admin: all; others: just their own)
- `GET /units/:id`
- `POST /units` (admin)
- `PATCH /units/:id` (admin; owner can edit limited fields)

### Expenses
- `GET /expenses` (filters: category, dateFrom, dateTo)
- `POST /expenses` (admin)
- `PATCH /expenses/:id` (admin)
- `DELETE /expenses/:id` (admin, soft delete)
- `POST /expenses/:id/split` (admin → generates Payment rows)

### Payments
- `GET /payments` (admin: all; resident: own unit only)
- `GET /payments/:id`
- `POST /payments` (admin: ad-hoc charge)
- `PATCH /payments/:id` (admin: mark paid, waive)
- `POST /payments/:id/pay` (resident: record payment / Stripe later)
- `POST /payments/run-monthly` (admin or cron: generates monthly_dues for all units)

### Polls
- `GET /polls`
- `POST /polls` (admin or owner)
- `GET /polls/:id` (includes own vote and, if closed, results)
- `PATCH /polls/:id` (creator/admin, only while draft)
- `POST /polls/:id/vote` { optionIds }
- `POST /polls/:id/close` (admin)

### Maintenance
- `GET /maintenance` (admin: all; resident: own unit + common-area)
- `POST /maintenance`
- `GET /maintenance/:id`
- `PATCH /maintenance/:id` (admin: status, assignedTo; filer: title/desc while open)
- `POST /maintenance/:id/comments`

### Documents
- `GET /documents` (filtered by visibility)
- `POST /documents` (admin, multipart upload)
- `GET /documents/:id/download` (signed URL)
- `DELETE /documents/:id` (admin)

### Notifications
- `GET /notifications` (cursor pagination)
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

---

## 6. Background Jobs / Cron

Run with `node-cron` or BullMQ + Redis:

| Job | Schedule | What |
|---|---|---|
| Generate monthly dues | 1st of month, 02:00 building TZ | For every unit with `monthlyDuesAmount > 0`, create a Payment with `dueDate` per `building.settings.monthlyDuesDay`. |
| Mark overdue | Daily, 03:00 | Payments past `dueDate + gracePeriodDays` flip to `overdue`. Notifications fired. |
| Late fee assessment | Daily, 03:15 | Adds late fee Payment row when triggered. |
| Poll closer | Every 15 min | Polls past `closesAt` → `closed`. |
| Email digest (optional) | Weekly Mon 08:00 | Resident summary: dues, open polls, maintenance updates. |

---

## 7. Frontend (React) — Screens & Routing

**Stack:** React 18 + Vite, React Router, TanStack Query, Tailwind, shadcn/ui, Zod (form validation), React Hook Form. State kept thin — server state via TanStack Query, UI state via React.

### Routes
```
/login
/invite/accept?token=...
/forgot-password / /reset-password

(authenticated layout)
/                          → dashboard (role-aware)
/expenses                  → list + filters; admin sees create button
/expenses/:id              → detail + receipt + splits
/payments                  → resident: own unit; admin: building-wide table
/payments/:id              → detail
/polls                     → open polls + results archive
/polls/:id                 → vote / view results
/polls/new                 → admin/owner
/maintenance               → list + statuses
/maintenance/:id           → thread + comments
/maintenance/new           → file request
/documents                 → list, search, download
/units                     → admin: all; resident: own
/units/:id                 → detail (residents, payment history)
/users                     → admin only
/invites                   → admin: all; owner: own unit
/notifications             → list
/settings                  → profile, password, building settings (admin)
```

### Dashboard widgets (role-conditional)
- **Admin:** total dues outstanding, overdue count, open maintenance, open polls, this month's expenses.
- **Owner:** my balance, next due date, open polls I can vote in, unit maintenance status, unread notifications.
- **Renter:** my dues (if any), open maintenance I filed, building announcements.
- **Dependent:** announcements, building documents, maintenance status.

---

## 8. Folder Structure

```
building-app/
├── client/                              # React + Vite
│   ├── src/
│   │   ├── api/                         # axios client + endpoint hooks
│   │   ├── auth/                        # context, guards, interceptors
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn
│   │   │   └── shared/
│   │   ├── features/
│   │   │   ├── expenses/
│   │   │   ├── payments/
│   │   │   ├── polls/
│   │   │   ├── maintenance/
│   │   │   ├── documents/
│   │   │   └── users/
│   │   ├── pages/                       # route components
│   │   ├── lib/                         # utils, formatters
│   │   ├── hooks/
│   │   ├── types/                       # shared TS types
│   │   └── main.tsx
│   ├── public/
│   └── vite.config.ts
│
├── server/                              # Express + Mongoose
│   ├── src/
│   │   ├── config/                      # env, db, logger
│   │   ├── models/                      # mongoose schemas
│   │   ├── routes/                      # express routers
│   │   ├── controllers/
│   │   ├── services/                    # business logic
│   │   ├── middleware/                  # auth, errors, validation
│   │   ├── jobs/                        # cron tasks
│   │   ├── utils/                       # email, signedUrl, etc.
│   │   ├── validators/                  # zod schemas
│   │   └── index.ts
│   ├── tests/
│   └── tsconfig.json
│
├── shared/                              # types/enums shared client + server
├── docker-compose.yml                   # mongo, redis, mailhog, app
├── .env.example
└── README.md
```

---

## 9. Key User Flows

### Flow A: Admin onboards a new owner
1. Admin → `/units/new` → creates Unit "3B" with `monthlyDuesAmount = 450`.
2. Admin → `/invites/new` → email = `owner@example.com`, role = `owner`, unit = "3B".
3. Server creates `User { status: 'invited' }` + `InviteToken`, sends email.
4. Owner clicks link → `/invite/accept?token=...` → sets password → JWT issued → lands on dashboard.

### Flow B: Monthly dues issued and paid
1. Cron `generate-monthly-dues` runs on the 1st → creates `Payment { type: 'monthly_dues', status: 'pending', dueDate: 5th }` for each unit.
2. Resident gets in-app + email notification.
3. Resident pays via bank transfer → admin marks `Payment.status = 'paid'`, `paymentMethod = 'transfer'`, `externalRef = 'BANK-12345'`.
4. Resident sees updated balance.
5. (Future) Stripe path: resident pays in-app → webhook flips status automatically.

### Flow C: Building expense split across units
1. Admin files Expense: $2,400 elevator repair.
2. Admin sets `splitMode: "equal"` across 8 occupied units → POST `/expenses/:id/split`.
3. Server generates 8 Payment rows of $300 each, type `expense_split`, dueDate +30 days.
4. Each owner notified.

### Flow D: Poll on a $10k facade repair
1. Admin creates Poll: "Approve $10k facade repair?" with options Yes/No, eligibleRoles `["owner"]`.
2. Status `open`, opens immediately, closes in 7 days.
3. Each owner votes.
4. Cron closes the poll. Results visible.

### Flow E: Maintenance request
1. Renter files: "Kitchen sink leak", priority `high`.
2. Admin sees in dashboard, assigns to "Mike's Plumbing", status `in_progress`.
3. Plumber resolves → admin marks `resolved`, adds resolution note.
4. Filer notified, can re-open within 7 days if not actually fixed.

---

## 10. Tech Choices Summary

| Area | Choice | Why |
|---|---|---|
| Runtime | Node 20 LTS | Stable, modern. |
| Server | Express 4 | Familiar, vast ecosystem. Could swap for Fastify later. |
| Language | TypeScript | Type safety across stack via `shared/`. |
| DB | MongoDB 7 + Mongoose | Flexible schema, good for evolving feature set. |
| Auth | JWT (access+refresh) + bcrypt | Self-contained, no third-party dep. |
| Validation | Zod | Same schemas usable client + server. |
| Frontend | React 18 + Vite | Fast DX. |
| Data fetching | TanStack Query | Cache, revalidation, mutations. |
| Styling | Tailwind + shadcn/ui | Fast to build clean UIs. |
| File storage | S3-compatible (or local in dev) | Receipts, documents. Pre-signed URLs. |
| Email | Resend or SendGrid | Invites, password reset, notifications. |
| Jobs | node-cron (v1); BullMQ + Redis (v2) | Simple to start. |
| Testing | Vitest + Supertest | Fast, ESM-friendly. |
| Deploy | Docker → Fly.io / Render / DO App Platform | Simple managed deploy. |

---

## 11. Roadmap

### v1 (this build)
- Auth + invites + roles
- Units + users
- Expenses + Payments (manual mark-paid)
- Polls + voting
- Maintenance requests + comments
- Documents (upload/download)
- Notifications (in-app + email)
- Admin dashboard, role-aware home, settings

### v2
- **Real-time chat** (Socket.io): building-wide channel, unit channel, admin announcements channel. Was deferred from v1 to keep scope tight; data models can be added now without disrupting v1.
- Stripe-based online payments
- Multi-unit owners, multiple owners per unit
- Mobile PWA polish + push notifications
- Audit log
- Vendor directory

### v3
- Multi-building tenancy
- Reporting / exports (PDF, CSV)
- Calendar (events, board meetings)
- Package room / amenity bookings

---

## 12. Open Questions

These will shape implementation; worth deciding before kickoff:

1. **Currency / locale.** Single building → single currency? Default `USD`, or set from your building's locale?
2. **Who pays dues — owner or renter?** Some buildings bill owners; some let owners delegate to their renter. Need a per-unit flag?
3. **Late fees.** Flat amount, percentage, or both? When do they trigger (1 day late, 5 days late)?
4. **Email provider.** Resend, SendGrid, Postmark, or SES? (I lean Resend — simplest API.)
5. **File storage.** S3, R2, or local-disk for v1? (R2 is cheap; local-disk fine for dev.)
6. **Poll eligibility nuance.** Only owners vote, or weighted by unit size / sqft for financial decisions? Some HOAs weight votes — worth clarifying.
7. **Dependents — fully separate logins, or read-only proxy of owner's account?** Currently: separate logins, read-only on most things. Confirm.
8. **Hosting + budget.** Self-host (DO droplet, ~$10/mo) or managed (Render/Fly, ~$25–50/mo)?
9. **Data residency / privacy.** Any local regulations to worry about (residents' personal data)?

---

## 13. Next Steps

Once the open questions are settled, the build order I'd recommend:
1. Repo + monorepo tooling, Docker compose, env scaffolding.
2. Server: Building, Unit, User models + auth + invite flow. Manual smoke-test via Postman.
3. Client: login, invite-accept, dashboard skeleton, role-aware nav.
4. Expenses + Payments (server then client).
5. Polls (server then client).
6. Maintenance + Documents.
7. Notifications + email.
8. Cron jobs.
9. Polish, tests, deploy.

Estimated full-time effort for v1: **~4–6 weeks** for one developer comfortable with MERN; **~8–10 weeks** part-time evenings/weekends.
