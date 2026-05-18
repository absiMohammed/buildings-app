# Business Requirements Document — Residential Building Management App

**Project:** Building App
**Author:** Mohammed Absi (with audit-based gap analysis)
**Date:** 2026-05-15
**Status:** Draft v1 — for review

This document defines the business requirements for an ideal residential building management application, then compares those requirements against the current Building App codebase and ends with a consolidated recommended scope for the next milestone ("the best of both").

---

## 1. Executive summary

Residential buildings — especially mid-size apartment blocks in MENA-region markets — are typically managed today through a combination of WhatsApp groups, paper receipts, and an Excel sheet on the building manager's laptop. Information lives in the manager's head; residents have no visibility into where their dues go; and disputes are resolved by memory.

The Building App is a multi-tenant platform that gives one building (extensible to many) a single source of truth for finances, governance, maintenance, and communication. v1 targets one building per deployment; multi-building is a v2 capability.

This BRD is written assuming the **product hypothesis** is sound — the goal here is to align everyone on *what* the product must do (the business view), not on *how* it does it (the architecture). A separate `ARCHITECTURE.md` covers the latter.

---

## 2. Vision and objectives

### 2.1 Vision

> Every resident knows what they owe, why they owe it, and what's being done about the issue they reported — without ever calling the building manager.

### 2.2 Strategic objectives

| # | Objective | How we measure |
|---|---|---|
| O1 | Eliminate the building manager's reliance on Excel for collections | 100% of monthly dues issued + tracked in-app within 3 months |
| O2 | Give residents real-time visibility into their financial standing | NPS ≥ 40 among owners after 6 months |
| O3 | Replace WhatsApp as the maintenance request channel | ≥ 80% of new tickets filed in-app within 6 months |
| O4 | Make governance decisions auditable | 100% of votes recorded in-app with timestamp + voter identity |
| O5 | Operate as a viable Arabic-first product | Arabic and English render at full parity; RTL layout passes manual review |

### 2.3 Non-goals (v1)

- Multi-building portfolios.
- Public marketplace / classifieds between buildings.
- Accounting-grade general ledger (we do collection accounting only).
- Native white-label apps for property management companies.
- Embedded payment processing (we capture method + reference, we don't move money).

---

## 3. Stakeholders & personas

### 3.1 Primary roles (in-app)

| Role | Who they are | Primary needs |
|---|---|---|
| **Admin** | Building manager, committee chair, or appointed treasurer | Issue dues, track collections, log expenses, run polls, resolve tickets, invite users, edit unit data |
| **Owner** | Holds title to a unit. One owner per unit in v1 | See unit balance, pay dues, file tickets, vote on polls, invite their renter / family members |
| **Renter** | Tenant in an owner's unit | See announcements + relevant payments, file tickets, view documents |
| **Dependent** | Family member of an owner — spouse, adult child | Read-only access to most data, can file tickets |

### 3.2 Outside-the-app actors

| Actor | Touchpoint |
|---|---|
| **Vendor / contractor** | Receives ticket work via the admin out-of-band; status updates flow through admin |
| **Tax authority / auditor** | Receives exported financial reports (CSV / PDF), never logs into the app |
| **Bank / payment platform** | We record external reference IDs; no direct integration in v1 |

### 3.3 Persona snapshots

- **Adam, building manager (admin).** 55, runs a 24-unit walk-up. Wants to stop chasing payments via WhatsApp. Needs the app to show him *who owes what* at a glance and let him mark cash receipts in under 10 seconds.
- **Lina, owner.** 38, owns one unit, rents out another. Wants visibility into both units' balances and a clear paper trail when her renter pays. Comfortable with online banking but pays with bank transfer.
- **Tareq, renter.** 27, in Lina's rental unit. Doesn't care about governance, but cares a lot about whether the elevator gets fixed and whether his rent receipt is recorded.
- **Sana, dependent.** Lina's adult daughter, lives in the unit. Files maintenance issues when nobody's home, otherwise rarely opens the app.

---

## 4. Scope

### 4.1 In scope — v1

1. Authentication & user lifecycle (invite-only signup, multi-role)
2. Building profile + settings (currency, timezone, dues policy)
3. Unit registry + ownership / occupancy tracking
4. Monthly dues issuance + per-unit overrides
5. Payment recording (cash / transfer / external reference)
6. Expense logging + automatic expense splitting (equal, by sqft)
7. Polls (create / vote / close), with owner-only eligibility default
8. Maintenance request workflow (file / triage / assign / resolve, with comments)
9. Document library (upload, categories, visibility tiers)
10. In-app notifications + email (no SMS in v1)
11. Arabic + English UI with consistent typography
12. Dashboard with role-specific widgets
13. Settings UI for admin (building) and individual (profile / notifications)

### 4.2 Deferred to v2

- Password reset (currently invite-only re-issue)
- Late-fee automation
- SMS notifications
- Native push notifications
- File attachments on tickets / comments
- Versioned documents
- Multi-building tenancy
- Online payment gateway

### 4.3 Out of scope (forever, in current product)

- Tax / legal advice
- Accounting GL (debits/credits/journals)
- Public-facing marketing surface inside the app
- Cross-tenant communication

---

## 5. Functional requirements

Each requirement is tagged `[FR-<area>-<n>]` and graded as **must / should / could** (MoSCoW). The **status column** in §7 maps each requirement to current implementation.

### 5.1 Authentication & user lifecycle

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-1 | Users sign in with email *or* phone number + password | Must |
| FR-AUTH-2 | First-time access is invite-token only; tokens expire after 7 days | Must |
| FR-AUTH-3 | Sessions use access + refresh JWTs; refresh rotates on use | Must |
| FR-AUTH-4 | Sign-out revokes the refresh token server-side | Must |
| FR-AUTH-5 | Users can reset their password via email link if they forget it | Must |
| FR-AUTH-6 | Suspended users cannot authenticate or hold a live session | Must |
| FR-AUTH-7 | Two-factor authentication via email OTP for admin role | Should |
| FR-AUTH-8 | Account lockout after N failed login attempts within M minutes | Should |
| FR-AUTH-9 | Self-service profile edit (name, phone, password) | Must |

### 5.2 Building profile & settings

| ID | Requirement | Priority |
|---|---|---|
| FR-BLD-1 | Each building has a name, address, default currency, timezone | Must |
| FR-BLD-2 | Admin can configure the monthly dues day (1–28) | Must |
| FR-BLD-3 | Admin can configure the default monthly dues amount applied to units | Must |
| FR-BLD-4 | Admin can configure late-fee policy (grace days + flat amount + percent) | Should |
| FR-BLD-5 | All financial computations honor the building's currency + timezone | Must |
| FR-BLD-6 | Building name change propagates to all rendered headers within one session | Must |
| FR-BLD-7 | Admin can preview the effect of a settings change before saving | Could |

### 5.3 Units & residents directory

| ID | Requirement | Priority |
|---|---|---|
| FR-UNIT-1 | Admin can create, edit, and view units (number, floor, sqft, bedrooms, notes) | Must |
| FR-UNIT-2 | Each unit may have one owner and zero or more occupants (renter + dependents) | Must |
| FR-UNIT-3 | A unit's monthly dues amount may override the building default; null = inherit | Must |
| FR-UNIT-4 | Admin can mark a unit as occupied / vacant for occupancy reporting | Must |
| FR-UNIT-5 | The unit detail page shows: residents, dues history, current balance | Must |
| FR-UNIT-6 | Owners see their own unit detail; admins see all units | Must |
| FR-UNIT-7 | A unit's occupancy day is overridable per unit (e.g. some units pay on 5th) | Should |

### 5.4 Finance — collections

| ID | Requirement | Priority |
|---|---|---|
| FR-PAY-1 | The system issues a Payment row per unit on the configured dues day, monthly | Must |
| FR-PAY-2 | Admin can record a one-off charge against one or more units | Must |
| FR-PAY-3 | Admin can mark a Payment as received (paid / paymentMethod / externalRef) | Must |
| FR-PAY-4 | A resident can self-record a payment as "transferred — pending admin confirmation" | Must |
| FR-PAY-5 | A pending payment becomes overdue when the due date is past, automatically | Must |
| FR-PAY-6 | Late fees are auto-assessed on overdue payments after the grace period | Should |
| FR-PAY-7 | A waiver action can mark a payment as forgiven with a note | Must |
| FR-PAY-8 | Each unit's outstanding balance is visible to the owner + admin | Must |
| FR-PAY-9 | Payments produce a printable / shareable receipt | Could |
| FR-PAY-10 | Collections summary by month: collected / outstanding / waived | Must |

### 5.5 Finance — expenses

| ID | Requirement | Priority |
|---|---|---|
| FR-EXP-1 | Admin can log an expense (category, amount, vendor, date, optional receipt) | Must |
| FR-EXP-2 | An expense can be split across all units (equal) or by sqft | Must |
| FR-EXP-3 | Splitting an expense generates per-unit Payment rows of type `expense_split` | Must |
| FR-EXP-4 | Expenses are soft-deletable for audit (deletedAt, not hard delete) | Must |
| FR-EXP-5 | Expenses report: month-to-date, year-to-date, by category | Must |
| FR-EXP-6 | A vendor field is searchable for repeat-vendor reporting | Should |
| FR-EXP-7 | Receipt images stored on disk in v1; S3-pluggable in v2 | Should |

### 5.6 Polls / governance

| ID | Requirement | Priority |
|---|---|---|
| FR-POLL-1 | Admin (and optionally owners) can create polls with N options | Must |
| FR-POLL-2 | A poll can be scheduled to open at a future date (`opensAt`) | Must |
| FR-POLL-3 | Polls auto-close at `closesAt`; results visible thereafter | Must |
| FR-POLL-4 | Default eligibility is owners-only; configurable per-poll | Must |
| FR-POLL-5 | Anonymous polls store the vote without recording who cast it | Should |
| FR-POLL-6 | A user can only vote once; multi-option votes allowed if `allowMultiple` | Must |
| FR-POLL-7 | Results show counts + percentages, and (if not anonymous) voter list | Must |
| FR-POLL-8 | Closed polls show final tally for the historical record | Must |

### 5.7 Maintenance

| ID | Requirement | Priority |
|---|---|---|
| FR-MTC-1 | Any authenticated user can file a maintenance request | Must |
| FR-MTC-2 | A request is tagged with: unit (or "common area"), category, priority, status | Must |
| FR-MTC-3 | Admin can change status, priority, and assignee | Must |
| FR-MTC-4 | The filer can edit title / description while status is open or in_progress | Must |
| FR-MTC-5 | Comments are visible to: admin, filer, same-unit occupants (or all if common area) | Must |
| FR-MTC-6 | Photo / file attachments on the request and on each comment | Should |
| FR-MTC-7 | Notifications fire when a request changes status | Must |
| FR-MTC-8 | Resolution notes captured on resolve; resolved time stamped | Must |
| FR-MTC-9 | Lifecycle: open → in_progress → resolved → closed; admin can reopen | Must |

### 5.8 Documents

| ID | Requirement | Priority |
|---|---|---|
| FR-DOC-1 | Admin can upload PDFs, images, and office files; max 25 MB per file | Must |
| FR-DOC-2 | Documents are categorized (bylaws / minutes / notice / contract / other) | Must |
| FR-DOC-3 | Each document has a visibility tier: all / owners_only / admin_only | Must |
| FR-DOC-4 | Residents can search documents by title / description | Should |
| FR-DOC-5 | Document versioning: replacing a document keeps the prior version | Could |
| FR-DOC-6 | Documents are scoped to the building (no cross-tenant leak) | Must |

### 5.9 Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-NTF-1 | In-app notification feed listing recent items | Must |
| FR-NTF-2 | A notification can be marked read individually or all at once | Must |
| FR-NTF-3 | Trigger types: payment_due, payment_overdue, poll_open, maintenance_update, announcement | Must |
| FR-NTF-4 | Notifications deep-link into the relevant entity in-app | Must |
| FR-NTF-5 | Optional email delivery, configurable per user / per type | Should |
| FR-NTF-6 | SMS delivery (v2 only) | Could |
| FR-NTF-7 | Push notifications on mobile (v2 only) | Could |

### 5.10 Dashboard & reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-DSH-1 | Role-aware dashboard: each role sees a curated set of widgets | Must |
| FR-DSH-2 | Admin: collections, expenses, open polls, ticket queue, occupancy | Must |
| FR-DSH-3 | Owner: own balance, next due, polls open to me, my unit's tickets | Must |
| FR-DSH-4 | Renter / dependent: announcements, my tickets, my dues (if applicable) | Must |
| FR-DSH-5 | Year-to-date collections, expenses, and net for admin | Should |
| FR-DSH-6 | CSV export of any list view (payments, expenses, tickets) | Should |

### 5.11 Communication broadcasts

| ID | Requirement | Priority |
|---|---|---|
| FR-COM-1 | Admin can post a building-wide announcement | Should |
| FR-COM-2 | Announcements show in the in-app feed and optionally email | Should |
| FR-COM-3 | Announcements can target a sub-audience (e.g. owners only) | Could |

### 5.12 Settings & preferences (per-user)

| ID | Requirement | Priority |
|---|---|---|
| FR-USR-1 | User can switch language between English and Arabic | Must |
| FR-USR-2 | User can edit name, phone, password from their profile | Must |
| FR-USR-3 | User can toggle notification preferences by type | Must |
| FR-USR-4 | User can sign out from any session, all sessions revoked option | Should |

---

## 6. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-SEC-1 | All passwords stored as bcrypt with cost ≥ 12 | Mandatory |
| NFR-SEC-2 | Refresh tokens stored hashed, not in cleartext | Mandatory |
| NFR-SEC-3 | API uses HTTPS in production; cookies are `secure + httpOnly + sameSite` where applicable | Mandatory |
| NFR-SEC-4 | RBAC enforced server-side; client gating is advisory only | Mandatory |
| NFR-SEC-5 | Authenticated rate limits: 30 logins / 15 min / IP | Mandatory |
| NFR-PRF-1 | p95 API latency under 250 ms for list endpoints with default page size | Target |
| NFR-PRF-2 | Cold-start mobile login → first-paint < 2 s on a 4G connection | Target |
| NFR-RLB-1 | API uptime ≥ 99.5% during business hours | Target |
| NFR-RLB-2 | Daily MongoDB backups retained 30 days | Mandatory |
| NFR-I18N-1 | All user-visible strings live in `strings.ts` (no inline literals) | Mandatory |
| NFR-I18N-2 | RTL layout passes visual review on every screen | Mandatory |
| NFR-A11Y-1 | Touch targets ≥ 44pt; text contrast ≥ WCAG AA | Target |
| NFR-LGL-1 | Soft-delete of expenses retains audit trail for ≥ 7 years | Should |
| NFR-OBS-1 | Structured logs (pino); request IDs propagated end-to-end | Mandatory |
| NFR-PRV-1 | Personal data deletion on owner request (right-to-erasure) | Should |

---

## 7. Comparison: BRD vs current Building App

Each FR is graded:
- ✅ **Done** — implemented and wired end-to-end (or close enough that the gap is cosmetic)
- ⚠️ **Partial** — exists on the server but not in clients, or in mobile but not web, or implemented with a known gap
- ❌ **Missing** — no implementation
- 🐛 **Buggy / drifted** — implemented but with a defect or contract drift

For brevity I group by epic and flag exceptions.

### 7.1 Auth / user lifecycle

| ID | Status | Notes |
|---|---|---|
| FR-AUTH-1 | ✅ | Identifier accepts email *or* phone (normalized) |
| FR-AUTH-2 | ✅ | Invite tokens hashed, 7-day TTL |
| FR-AUTH-3 | ✅ | Access/refresh JWT, rotation on refresh |
| FR-AUTH-4 | ✅ | Server clears `refreshTokenHash` on logout |
| FR-AUTH-5 | ❌ | **No forgot-password / reset-password endpoints.** Admin must re-issue an invite. |
| FR-AUTH-6 | ⚠️ | Status is captured but routes do not re-check `user.status` on every request — suspending a user does not invalidate live access tokens until they expire |
| FR-AUTH-7 | ❌ | No 2FA |
| FR-AUTH-8 | ⚠️ | `express-rate-limit` is on auth routes but no progressive lockout |
| FR-AUTH-9 | ⚠️ | `PATCH /me` endpoint exists but no client UI calls it |

### 7.2 Building settings

| ID | Status | Notes |
|---|---|---|
| FR-BLD-1 | ✅ | Building model has all fields |
| FR-BLD-2 | ✅ | Settable from mobile Settings page |
| FR-BLD-3 | ✅ | Same |
| FR-BLD-4 | ⚠️ | `Building.settings.lateFee` exists; no automated assessment cron (see FR-PAY-6) |
| FR-BLD-5 | 🐛 → ✅ | **Fixed in last pass**: cron jobs now honor `settings.timezone` |
| FR-BLD-6 | ✅ | `updateBuilding` in AuthContext propagates synchronously |
| FR-BLD-7 | ❌ | No preview UI |

### 7.3 Units

| ID | Status | Notes |
|---|---|---|
| FR-UNIT-1 | ⚠️ | Server has CRUD; mobile UI reads from mock store, never calls `/units` |
| FR-UNIT-2 | ✅ | `Unit.ownerId` + `Unit.occupants` |
| FR-UNIT-3 | ✅ | `Unit.monthlyDuesAmount` is nullable; resolver falls back to building default |
| FR-UNIT-4 | ⚠️ | `occupancyStatus` is mock-only in mobile; not part of server model |
| FR-UNIT-5 | ⚠️ | UI exists on mobile, all data is mock |
| FR-UNIT-6 | ✅ | RoleGate routes Units / UnitDetail to admin only |
| FR-UNIT-7 | ✅ | `Unit.monthlyDuesDayOverride` modeled |

### 7.4 Finance — collections

| ID | Status | Notes |
|---|---|---|
| FR-PAY-1 | ✅ | `generateMonthlyDues` service + cron |
| FR-PAY-2 | ⚠️ | `POST /payments` exists; **no mobile or web client calls it** |
| FR-PAY-3 | ⚠️ | `PATCH /payments/:id` exists; only web client calls it |
| FR-PAY-4 | ⚠️ | `POST /payments/:id/pay` exists; only web client calls it |
| FR-PAY-5 | ✅ | `markOverduePayments` cron flips status to overdue |
| FR-PAY-6 | ❌ | **No late-fee Payment auto-generation.** Only the status flip; no fee row created |
| FR-PAY-7 | ⚠️ | `waived` is in the enum but no admin UI applies it |
| FR-PAY-8 | ⚠️ | `unitBalance()` exists in mocks; server side has no aggregated balance endpoint |
| FR-PAY-9 | ❌ | No receipt rendering |
| FR-PAY-10 | ⚠️ | Mobile dashboard shows charts off mock data; no server endpoint for monthly summary |

### 7.5 Finance — expenses

| ID | Status | Notes |
|---|---|---|
| FR-EXP-1 | ⚠️ | Server CRUD complete; no client calls it |
| FR-EXP-2 | ✅ → ✅ | `equal` and `by_sqft` work. `by_unit_pct` was a stub and **was removed in the last pass** |
| FR-EXP-3 | ✅ | `POST /expenses/:id/split` generates Payment rows |
| FR-EXP-4 | ✅ | `deletedAt` soft-delete is honored on list query |
| FR-EXP-5 | ⚠️ | No server-side aggregation endpoint; mobile reads mock |
| FR-EXP-6 | ⚠️ | Vendor field exists, no search |
| FR-EXP-7 | ✅ | Local-disk via multer (`STORAGE_LOCAL_DIR`); S3-pluggable would be v2 |

### 7.6 Polls

| ID | Status | Notes |
|---|---|---|
| FR-POLL-1 | ✅ | Admin + owner both allowed |
| FR-POLL-2 | ✅ | `opensAt` scheduled; cron flips `draft → open` |
| FR-POLL-3 | ✅ | Cron flips `open → closed` at `closesAt` |
| FR-POLL-4 | ✅ | `eligibleRoles[]` per poll |
| FR-POLL-5 | ✅ | `anonymous: true` skips Vote linkage |
| FR-POLL-6 | ✅ | Vote model unique index `(pollId, userId)` |
| FR-POLL-7 | ⚠️ | Server returns the poll, but results aren't computed server-side — clients must aggregate Vote rows |
| FR-POLL-8 | ✅ | Vote rows are durable |
| — | ⚠️ | **Mobile reads polls from mock store.** Server is fully built. |

### 7.7 Maintenance

| ID | Status | Notes |
|---|---|---|
| FR-MTC-1 | ✅ | `POST /maintenance` |
| FR-MTC-2 | ✅ | All fields modeled |
| FR-MTC-3 | ✅ | `PATCH /maintenance/:id` admin-only changes |
| FR-MTC-4 | ✅ | Filer can edit title/description while open/in_progress |
| FR-MTC-5 | 🐛 → ✅ | **Fixed in last pass**: comment endpoint now requires admin, filer, or same-unit occupant |
| FR-MTC-6 | ❌ → ❌ | Attachments stub was **removed in the last pass** (no endpoint populated it); needs a real upload endpoint when shipping the feature |
| FR-MTC-7 | ⚠️ | Notifications model supports `maintenance_update`; no code path creates them |
| FR-MTC-8 | ✅ | `resolutionNotes` + `resolvedAt` on resolve |
| FR-MTC-9 | ✅ | Status enum + admin transitions |
| — | ⚠️ | **Mobile reads tickets from mock store.** Server is fully built. |

### 7.8 Documents

| ID | Status | Notes |
|---|---|---|
| FR-DOC-1 | ✅ | Multer upload, 25 MB cap |
| FR-DOC-2 | ✅ | Category enum |
| FR-DOC-3 | ✅ | Visibility tier enforced on `GET /documents/:id/download` |
| FR-DOC-4 | ⚠️ | Mobile UI is fixture-driven; no real search query against the server |
| FR-DOC-5 | ❌ | No versioning |
| FR-DOC-6 | ✅ | Scoped by `buildingId` |

### 7.9 Notifications

| ID | Status | Notes |
|---|---|---|
| FR-NTF-1 | ⚠️ | Server endpoint exists (`GET /notifications`); **no client UI** |
| FR-NTF-2 | ⚠️ | Endpoints exist for individual + bulk mark-read; no UI |
| FR-NTF-3 | ⚠️ | Enum supports all 5 types; only `payment_due` has a creator code path |
| FR-NTF-4 | ⚠️ | `link` field is populated for payment_due; clients don't navigate to it |
| FR-NTF-5 | ⚠️ | Email transport (nodemailer + MailHog) only used for invites, not notifications |
| FR-NTF-6 | ❌ | No SMS |
| FR-NTF-7 | ❌ | No push |

### 7.10 Dashboard & reporting

| ID | Status | Notes |
|---|---|---|
| FR-DSH-1 | ✅ | Capabilities-driven widget set |
| FR-DSH-2 | ⚠️ | UI fully designed; all numbers come from mock store |
| FR-DSH-3 | ⚠️ | Same |
| FR-DSH-4 | ⚠️ | Same |
| FR-DSH-5 | ❌ | No YTD aggregation endpoint |
| FR-DSH-6 | ❌ | No CSV export |

### 7.11 Communication

| ID | Status | Notes |
|---|---|---|
| FR-COM-1 | ❌ | No "announcement" entity yet (could ride on Notifications + new "announcement" creator endpoint) |
| FR-COM-2 | ❌ | Same |
| FR-COM-3 | ❌ | Same |

### 7.12 User preferences

| ID | Status | Notes |
|---|---|---|
| FR-USR-1 | ✅ | Mobile language switcher works; requires restart for layout direction |
| FR-USR-2 | ⚠️ | Server `PATCH /me` exists; mobile/web don't expose UI |
| FR-USR-3 | ⚠️ | Mobile shows toggles but stores them locally only (`useState`), not persisted server-side |
| FR-USR-4 | ❌ | No "sign-out everywhere" affordance |

### 7.13 Non-functional summary

| Area | State |
|---|---|
| Security baseline | ✅ bcrypt 12, JWT rotation, helmet, rate limits, RBAC enforced server-side |
| Performance baseline | ✅ Queries have indexes on the hot paths |
| Observability | ⚠️ Logger is structured (pino) but no request-ID propagation; no metrics |
| Backups | ❌ Not configured (Docker compose has no backup volume policy) |
| i18n | ✅ EN + AR keys symmetric (after last pass); inline strings minimized |
| RTL | ✅ Anchor-left convention enforced via `Text.render` patch; logical `start`/`end` used in positioning |
| Accessibility | ⚠️ Touch targets generally OK; contrast / a11y labels not audited |
| Privacy / right-to-erasure | ❌ Not implemented |

---

## 8. Headline gaps, ranked by impact

These are the items most worth investing the next sprint in.

### Tier A — blocks real-world use

1. **Mobile finance is mock-only.** Payments, expenses, and the entire dashboard read from `MockStoreProvider` instead of the real API. This is the single biggest gap between the BRD and reality — without it, no admin can actually run their building from the app. **(FR-PAY-2…10, FR-EXP-1/5, FR-DSH-2…4)**
2. **Mobile maintenance + polls are mock-only.** Same problem, different feature. Server is fully built; clients are not wired. **(FR-MTC-1…9, FR-POLL-1…8)**
3. **Notifications have no UI anywhere.** Server emits `payment_due` rows; no one ever sees them. **(FR-NTF-1…4)**
4. **No password reset.** Locked-out users can't recover their account without contacting the admin. **(FR-AUTH-5)**
5. **Suspended users keep their access tokens until expiry.** Token TTL is the only thing protecting against a suspended admin continuing to act. **(FR-AUTH-6)**

### Tier B — feature parity gaps

6. **Web client is ~25% of the mobile surface.** Six feature routes are placeholder pages. If the web client is intended to be a usable surface for admins on a laptop, it needs the same wiring pass mobile needs.
7. **Late-fee assessment doesn't create fee rows.** `markOverduePayments` flips status but never appends the late fee Payment the BRD calls for. **(FR-PAY-6)**
8. **Notification trigger coverage is partial.** Only `payment_due` has a creator path; `poll_open`, `maintenance_update`, `announcement` are unreachable. **(FR-NTF-3)**
9. **No receipt / shareable artifact** for paid items. **(FR-PAY-9)**
10. **No CSV export.** Auditors and accountants need to take data out of the app. **(FR-DSH-6)**

### Tier C — contract / hygiene

11. **`shared/types.ts` is barely adopted.** Mobile and web define inline duplicate interfaces for `Payment` and `Poll` that omit server fields. Promote shared types to the canonical source. *(architecture)*
12. **Three capability ids defined and never gated** in mobile (`PAYMENT_MARK_PAID`, `PAYMENT_RECORD`, `DOCUMENT_UPLOAD`). Delete or use. *(architecture)*
13. **Dead server endpoints** — none of the documents, notifications, units (list), users (list), or maintenance routes are called by mobile. Inventory and tag each as "ship me" or "delete me" before v1.1 ships.

### Tier D — non-functional polish

14. Backups + restore runbook.
15. Request-ID propagation and basic metrics.
16. Right-to-erasure workflow (delete-account button).
17. Accessibility pass (contrast + labels).
18. 2FA for admins.

---

## 9. Recommended consolidated v1.1 scope ("the best of both")

This section is the recommendation: which BRD requirements to commit to in the next release given what's already built. The goal is to ship a coherent v1.1 that puts the existing server-side work to use and closes the most painful gaps, without scope creep.

### 9.1 Commit to ship in v1.1

| Workstream | Outcome | What it touches |
|---|---|---|
| **W1 — Mobile real-API wiring** | Mobile reads + writes against the real server for: payments, expenses, polls, maintenance, units (admin), users (admin). Delete the mock store after the migration. | All mobile pages except auth |
| **W2 — Notifications end-to-end** | An in-app feed on mobile with mark-read. Server emits `poll_open` and `maintenance_update` triggers in addition to `payment_due`. Optional email per type (gated by user pref). | server + mobile |
| **W3 — Password reset** | Forgot-password email + reset endpoints. Mobile + web UI. | server + both clients |
| **W4 — Suspension actually kicks people out** | All authenticated middleware re-checks `user.status` and rejects suspended users; logout-everywhere endpoint added. | server |
| **W5 — Late-fee automation** | When payment goes overdue past the grace period, create a sibling Payment row of type `late_fee` (new enum value) with the configured flat + percent component. | server |
| **W6 — Receipts** | A `GET /payments/:id/receipt` endpoint that returns a PDF (or printable HTML) summary. Mobile share-sheet integration. | server + mobile |
| **W7 — Shared types adoption** | Mobile and web both import the contract types from `shared/types.ts`; inline duplicates deleted. | architecture |
| **W8 — Web client buildout** | Replace the six placeholder routes with real UIs that consume the same endpoints mobile uses. Lower priority than W1 but parallelizable. | web client |

### 9.2 Defer to v1.2

- File attachments on tickets and ticket comments (FR-MTC-6).
- Document versioning (FR-DOC-5).
- Announcements as a first-class entity (FR-COM-1…3) — until then, a notification with `type: 'announcement'` is enough.
- 2FA for admins (FR-AUTH-7).
- CSV export (FR-DSH-6).
- Right-to-erasure flow (NFR-PRV-1).
- Self-service profile edit UI (FR-AUTH-9 / FR-USR-2 / FR-USR-3) — server is ready; UI can wait one cycle.

### 9.3 Drop or rewrite

- **`by_unit_pct` split mode.** Already removed from the enum in the last pass; keep removed unless a user explicitly asks for it.
- **`MaintenanceRequest.attachments[]`.** Already removed. Re-add only as part of the v1.2 attachment epic, modeled the same way as Document uploads.
- **Mock store provider** in mobile — delete after W1 migrates each feature. Replace with optimistic React Query updates.
- **Three orphaned capability ids** — delete from `capabilities.ts` once the mock store goes.

### 9.4 Re-classify out-of-spec items

- Three categories of work that exist in code but should be treated as v2 unless explicitly demanded: SMS delivery, native push notifications, S3 storage.

### 9.5 Risks and open questions

1. **Mock-to-real migration disruption.** Wiring nine feature surfaces to a live backend is several weeks of focused work. Pick a single feature (recommend **maintenance**, since its data shape is simpler than payments) as the pilot and use what you learn to template the rest.
2. **Authoritative role of `MockStoreProvider`.** Today it's used for demo / development. Once W1 lands, we either delete it or repurpose it as an offline cache layer. Decide upfront.
3. **Web vs mobile priority.** If the customer-facing target is mobile-first, W8 (web buildout) could be pushed entirely to v2 instead of running in parallel.
4. **i18n coverage debt.** ~99 string keys in `strings.ts` are defined but unused. Most are future-feature stubs; revisit when the feature ships.
5. **Performance under real load.** No load tests run. Add k6 / artillery scripts before the v1.1 rollout to confirm the indexes hold up.
6. **Accessibility & compliance.** No formal audit yet. Schedule one before any non-pilot deployment.

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Building** | A single residential building, the top-level tenant in v1 |
| **Unit** | An apartment within a building |
| **Admin** | Manager / committee chair of the building |
| **Owner** | Holds title to a unit |
| **Renter** | Tenant occupying a unit, invited by the owner or admin |
| **Dependent** | Family member of an owner, read-mostly access |
| **Payment** | A receivable from a unit — monthly dues, expense split, one-off, or late fee |
| **Expense** | A spend by the building, possibly split across units |
| **Poll** | A governance vote, owner-only by default |
| **Maintenance request / ticket** | A reported issue, with priority + status + comments |
| **Notification** | An in-app message targeted at a user, optionally also delivered by email |
| **Capability** | A fine-grained UI / action gate keyed off the user's role |
| **Visibility tier** | Document audience filter: `all`, `owners_only`, `admin_only` |

---

## 11. Sign-off

When this document is approved, the next deliverable is a workstream plan with engineering estimates per workstream in §9.1, plus a decision on whether the web client buildout (W8) runs in parallel or slips to v2.

> **Note on conventions used in this document.** "Must / should / could" follow MoSCoW. ✅/⚠️/❌/🐛 markers in §7 reflect the state of the codebase at 2026-05-15 — they will go stale fast once any of the §9.1 workstreams land.
