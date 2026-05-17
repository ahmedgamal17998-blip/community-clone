# Community Clone — Comprehensive Codebase Audit

> **Generated:** 2026-05-17  
> **Codebase path:** `D:\claude code\New folder\community-clone`  
> **Stack:** Next.js 14, Prisma + PostgreSQL, NextAuth v5, Pusher, Resend, Paymob/Subscription-base

---

## Section 1.1 — Current Prisma Schema

File: `prisma/schema.prisma`

### Summary

No model has a `tenantId` field. The platform uses a `Community → Group` hierarchy where `Community` functions as the tenant container. All tenant isolation relies on the Prisma relation chain (e.g. `channel.groupId → group.communityId → community.ownerId`), not a denormalized `tenantId` column.

### Model Inventory

| Model | Key Fields | Has tenantId? | Notable Indexes / Uniques |
|---|---|---|---|
| `Account` | id, userId, provider, providerAccountId | No | `@@unique([provider, providerAccountId])` |
| `Session` | id, sessionToken, userId, expires, deviceLabel, ip, userAgent, lastSeenAt | No | `@@index([userId, lastSeenAt])` |
| `VerificationToken` | identifier, token, expires | No | `@@unique([identifier, token])` |
| `User` | id, email (unique), handle (unique), canCreateGroups, passwordHash | No | Two unique constraints |
| `Presence` | userId (PK) | No | — |
| `Community` | id, slug (unique), name, ownerId, plan (FREE/PRO/ENTERPRISE) | No | `@@unique([slug])` |
| `Group` | id, communityId, slug (unique), visibility, active, deletedAt, freeTrialDays, retentionDays, tracksEnabled | No | `@@index([communityId])` |
| `GroupMembership` | id, groupId, userId, role, state, accessExpiresAt, lockedAt | No | `@@unique([groupId, userId])`, `@@index([groupId, state])` |
| `Invite` | id, token (unique), groupId, invitedById, role, expiresAt | No | `@@index([groupId])`, `@@index([email])` |
| `Channel` | id, groupId, slug, kind (PUBLIC/PRIVATE/ANNOUNCEMENT), tier (FREE/PREMIUM), visibility (LOCKED_VISIBLE/HIDDEN), chatEnabled | No | `@@unique([groupId, slug])` |
| `ChannelAccess` | id, channelId, userId | No | `@@unique([channelId, userId])` |
| `ChatThread` | id, kind (DIRECT/GROUP/CHANNEL), channelId (unique), groupId | No | `@@index([kind])`, `@@index([groupId])` |
| `ChatMessage` | id, threadId, authorId, body, replyToId, pinned, deletedAt | No | `@@index([threadId, createdAt])` |
| `ChatParticipant` | id, threadId, userId, lastReadAt | No | `@@unique([threadId, userId])` |
| `Post` | id, channelId, authorId, body, pinned | No | `@@index([channelId, pinned, createdAt])` |
| `SavedPost` | id, userId, postId | No | `@@unique([userId, postId])` |
| `Comment` | id, postId, authorId, parentId, audioUrl | No | `@@index([postId, createdAt])` |
| `Reaction` | id, emoji, authorId, postId?, commentId? | No | Two `@@unique` constraints |
| `Poll` | id, postId (unique), question, multipleChoice | No | — |
| `PollOption` | id, pollId, text, order | No | `@@index([pollId, order])` |
| `PollVote` | id, optionId, userId | No | `@@unique([optionId, userId])` |
| `Notification` | id, userId, actorId, type, groupId?, postId? | No | `@@index([userId, readAt, createdAt])` |
| `NotificationPreference` | id, userId (unique) | No | — |
| `Course` | id, groupId, slug, priceType, tier (FREE/PREMIUM), stripePriceId?, published | No | `@@unique([groupId, slug])` |
| `CourseModule` | id, courseId, releaseMode, dripDays | No | `@@index([courseId, position])` |
| `CourseEnrollment` | id, userId, courseId, groupId, stripeSessionId?, amountPaid | No | `@@unique([userId, courseId])` |
| `Lesson` | id, courseId, moduleId?, slug, kind (VIDEO/TEXT/QUIZ/ASSIGNMENT), releaseMode | No | `@@unique([courseId, slug])` |
| `LessonProgress` | id, userId, lessonId, courseId | No | `@@unique([userId, lessonId])` |
| `Quiz` | id, lessonId (unique) | No | — |
| `QuizQuestion` | id, quizId, type (SINGLE/MULTIPLE) | No | — |
| `QuizOption` | id, questionId, isCorrect | No | — |
| `QuizAttempt` | id, userId, quizId, score, passed | No | — |
| `Assignment` | id, lessonId (unique), submissionType | No | — |
| `AssignmentSubmission` | id, userId, assignmentId, score, gradedById | No | `@@unique([userId, assignmentId])` |
| `Credential` | id, courseId, kind (WELCOME/COMPLETION) | No | `@@unique([courseId, kind])` |
| `EarnedCredential` | id, userId, credentialId | No | `@@unique([userId, credentialId])` |
| `Event` | id, groupId, creatorId, startsAt, recurrence, tier, visibility, audienceMode | No | `@@index([groupId, startsAt])` |
| `EventRSVP` | id, eventId, userId, occurrenceStartsAt | No | `@@unique([eventId, userId, occurrenceStartsAt])` |
| `EventReminderSent` | id, eventId, userId, kind | No | Composite unique |
| `GoogleAccount` | id, userId (unique), googleSub (unique) | No | — |
| `Availability` | id, userId (unique), rules | No | — |
| `GroupBookingPolicy` | id, groupId (unique) | No | — |
| `Booking` | id, hostId, inviteeId, status, googleEventId, meetLink, groupId?, rescheduledFromId | No | `@@index([hostId, startsAt])` |
| `PointsLedger` | id, userId, groupId, delta, reason, refType, refId | No | `@@unique([userId, groupId, reason, refType, refId])` |
| `MemberAccess` | id, userId, groupId, resourceType, resourceId, mode (GRANT/DENY), source (MANUAL/PAYMENT/RULE), expiresAt | No | `@@unique([userId, resourceType, resourceId])` |
| `SubscriptionPlan` | id, groupId, name, durationDays, priceCents, externalProductId, externalProductSlug, externalPlanType, mappedTrackId | No | `@@unique([groupId, externalProductId, externalPlanType])` |
| `PlanResource` | id, planId, resourceType, resourceId | No | `@@unique([planId, resourceType, resourceId])` |
| `Subscription` | id, userId, groupId, planId, status, externalSubscriptionId, paymobOrderId | No | `@@index([userId, groupId, status])` |
| `PaymentWebhookEvent` | id, event, transactionId (unique), payload (Json), signatureOk, processed | No | `@@unique([transactionId])` |
| `LoginHistory` | id, userId, ip, userAgent, durationSec | No | `@@index([userId, createdAt])` |
| `MemberCheckIn` | id, userId, groupId, streak, pointsEarned, bucket | No | `@@unique([userId, groupId, bucket])` |
| `AdminPermission` | id, groupId, userId, capabilities (JSON string[]) | No | `@@unique([groupId, userId])` |
| `OnboardingConfig` | id, groupId (unique), enabled, steps (JSON) | No | — |
| `CourseAccessRule` | id, courseId, type, channelId?, minRole?, tenureDays? | No | — |
| `CourseManualGrant` | id, courseId, userId | No | `@@unique([courseId, userId])` |
| `EventAudience` | id, eventId, type, channelId?, courseId?, userId? | No | — |
| `AdminAnnouncement` | id, groupId, title, body, audience, audienceRef | No | `@@index([groupId, startsAt])` |
| `AnnouncementSeen` | id, announcementId, userId | No | `@@unique([announcementId, userId])` |
| `Track` | id, groupId, slug, isDefault, archived, position | No | `@@unique([groupId, slug])` |
| `TrackMember` | id, trackId, userId, groupId, source, assignedById | No | `@@unique([trackId, userId])`, `@@index([userId, groupId])` |
| `TrackChannel` | (trackId, channelId) composite PK | No | — |
| `TrackCourse` | (trackId, courseId) composite PK | No | — |
| `BookingOffering` | id, groupId, instructorSlug, eventSlug, tier, visibility, archived | No | `@@index([groupId, archived, position])` |

**Total models: 55**

---

## Section 1.2 — Existing Auth

File: `src/server/auth.ts`

### Auth Strategy

| Provider | Status | Notes |
|---|---|---|
| **Email magic link** (Resend) | Always active | Falls back to console logging if `AUTH_RESEND_KEY` unset |
| **Google OAuth** | Conditional | Enabled only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are both set |
| **Credentials (password)** | Partial | `src/server/actions/password-auth.ts` + `User.passwordHash` exist; `src/app/(auth)/register/` and `PasswordSignInForm.tsx` present — wired but optional |

**Session strategy:** `database` (NextAuth PrismaAdapter; sessions stored in `Session` table)

### Session Shape

```typescript
// session.user contains:
{
  id: string;       // User.id (injected in session callback)
  handle: string;   // User.handle (fetched from DB on each session callback call)
  locale: string;   // User.locale ("en" | "ar")
  // Standard NextAuth fields:
  name?: string;
  email?: string;
  image?: string;
}
```

**Note:** The `session` callback makes a DB query on every session read to hydrate `handle` and `locale`. This is a per-request N+1 if many pages call `auth()`.

### Roles System

Roles live in `GroupMembership.role` (not in the session). There is no global platform role stored in the session — all role checks are per-group DB lookups.

| Role | Rank | Defined in |
|---|---|---|
| `OWNER` | 3 (highest) | `src/server/permissions.ts` |
| `ADMIN` | 2 | `src/server/permissions.ts` |
| `CONTRIBUTOR` | 1 | `src/server/permissions.ts` |
| `MEMBER` | 0 | `src/server/permissions.ts` |

```typescript
// src/server/permissions.ts
export const ROLES = ["MEMBER", "CONTRIBUTOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];
```

Capabilities (granular admin permissions) are stored in `AdminPermission.capabilities` as a JSON string array per `(groupId, userId)`. See `src/server/capabilities.ts` for the full list (14 capabilities including `SUBS_MANAGE`, `MEMBERS_ADD`, `TRACKS_MANAGE`, etc.).

**No super-admin / platform-owner role exists in auth or database.** The `/owner/dashboard` route is gated only by `auth()` (any authenticated user who owns at least one community can access it).

---

## Section 1.3 — All Routes Tree

### Public Routes (no auth required)

| Route | File |
|---|---|
| `/` | `src/app/(marketing)/page.tsx` |
| `/login` | `src/app/(auth)/login/page.tsx` |
| `/register` | `src/app/(auth)/register/page.tsx` |
| `/verify` | `src/app/(auth)/verify/page.tsx` |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` |

### Protected App Routes (under `(app)/`)

| Route | File | Notes |
|---|---|---|
| `/home` | `src/app/(app)/home/page.tsx` | Activity feed |
| `/groups` | `src/app/(app)/groups/page.tsx` | Group discovery |
| `/groups/new` | `src/app/(app)/groups/new/page.tsx` | gated by `canCreateGroups` |
| `/groups/[slug]` | `src/app/(app)/groups/[slug]/page.tsx` | Group home |
| `/groups/[slug]/about` | `…/about/page.tsx` | |
| `/groups/[slug]/members` | `…/members/page.tsx` | |
| `/groups/[slug]/members/invite` | `…/members/invite/page.tsx` | |
| `/groups/[slug]/settings` | `…/settings/page.tsx` | Member settings |
| `/groups/[slug]/channels/new` | `…/channels/new/page.tsx` | |
| `/groups/[slug]/channels/[channelSlug]` | `…/channels/[channelSlug]/page.tsx` | |
| `/groups/[slug]/channels/[channelSlug]/chat` | `…/chat/page.tsx` | |
| `/groups/[slug]/events` | `…/events/page.tsx` | |
| `/groups/[slug]/events/new` | `…/events/new/page.tsx` | |
| `/groups/[slug]/events/[id]` | `…/events/[id]/page.tsx` | |
| `/groups/[slug]/events/[id]/edit` | `…/events/[id]/edit/page.tsx` | |
| `/groups/[slug]/learning` | `…/learning/page.tsx` | |
| `/groups/[slug]/learning/new` | `…/learning/new/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]` | `…/learning/[courseSlug]/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/edit` | `…/edit/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/outline` | `…/outline/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/insights` | `…/insights/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/access` | `…/access/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/lessons/new` | `…/lessons/new/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/lessons/[lessonSlug]` | `…/[lessonSlug]/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/lessons/[lessonSlug]/edit` | `…/edit/page.tsx` | |
| `/groups/[slug]/learning/[courseSlug]/lessons/[lessonSlug]/submissions` | `…/submissions/page.tsx` | |
| `/groups/[slug]/leaderboard` | `…/leaderboard/page.tsx` | |
| `/groups/[slug]/me` | `…/me/page.tsx` | Member self / subscription |
| `/groups/[slug]/book` | `…/book/page.tsx` | Booky booking page |
| `/groups/[slug]/admin` | `…/admin/page.tsx` | |
| `/groups/[slug]/admin/members` | `…/admin/members/page.tsx` | |
| `/groups/[slug]/admin/members/[userId]` | `…/[userId]/page.tsx` | |
| `/groups/[slug]/admin/channels` | `…/admin/channels/page.tsx` | |
| `/groups/[slug]/admin/plans` | `…/admin/plans/page.tsx` | |
| `/groups/[slug]/admin/settings` | `…/admin/settings/page.tsx` | |
| `/groups/[slug]/admin/requests` | `…/admin/requests/page.tsx` | |
| `/groups/[slug]/admin/branding` | `…/admin/branding/page.tsx` | |
| `/groups/[slug]/admin/team` | `…/admin/team/page.tsx` | |
| `/groups/[slug]/admin/courses/[courseId]/access` | `…/access/page.tsx` | |
| `/groups/[slug]/admin/announcements` | `…/announcements/page.tsx` | |
| `/groups/[slug]/admin/chats` | `…/chats/page.tsx` | |
| `/groups/[slug]/admin/onboarding` | `…/onboarding/page.tsx` | |
| `/groups/[slug]/admin/booking` | `…/booking/page.tsx` | Booky admin |
| `/bookings/[id]` | `…/bookings/[id]/page.tsx` | |
| `/chat` | `…/chat/page.tsx` | |
| `/chat/[id]` | `…/chat/[id]/page.tsx` | |
| `/chat/new` | `…/chat/new/page.tsx` | |
| `/c/[slug]` | `…/c/[slug]/page.tsx` | Community landing |
| `/create` | `…/create/page.tsx` | Community creation wizard |
| `/owner/dashboard` | `…/owner/dashboard/page.tsx` | Owner overview |
| `/owner/archive` | `…/owner/archive/page.tsx` | Archived groups |
| `/profile/[handle]` | `…/profile/[handle]/page.tsx` | |
| `/profile/[handle]/book` | `…/book/page.tsx` | |
| `/profile/[handle]/book/confirm` | `…/confirm/page.tsx` | |
| `/saved` | `…/saved/page.tsx` | |
| `/settings/profile` | `…/settings/profile/page.tsx` | |
| `/settings/notifications` | `…/settings/notifications/page.tsx` | |
| `/settings/google` | `…/settings/google/page.tsx` | |
| `/settings/availability` | `…/settings/availability/page.tsx` | |
| `/settings/devices` | `…/settings/devices/page.tsx` | |

### API Routes

| Route | Method | Notes |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler |
| `/api/webhooks/payment` | POST | Paymob/Subscription-base webhook |
| `/api/stripe/webhook` | POST | Stripe webhook (course enrollment only) |
| `/api/stripe/checkout` | GET/POST | Stripe checkout session |
| `/api/payments/checkout` | GET | Redirect to Subscription-base payment page |
| `/api/payments/cancel` | POST | Cancel subscription |
| `/api/payments/health` | GET | Payment system connection test |
| `/api/chat/threads` | GET/POST | Chat thread list / create |
| `/api/chat/threads/[id]/messages` | GET/POST | Chat messages |
| `/api/chat/typing` | POST | Typing indicator (Pusher) |
| `/api/chat/unread-count` | GET | |
| `/api/chat/channel-unread` | GET | |
| `/api/chat/upload` | POST | Chat file upload |
| `/api/notifications/list` | GET | |
| `/api/notifications/unread-count` | GET | |
| `/api/presence/heartbeat` | POST | |
| `/api/pusher/auth` | POST | |
| `/api/feed` | GET | Activity feed |
| `/api/google/connect` | GET | |
| `/api/google/callback` | GET | OAuth callback |
| `/api/google/disconnect` | POST | |
| `/api/groups/[slug]/member-search` | GET | |
| `/api/admin/upload` | POST | File upload |
| `/api/upload/post-image` | POST | |
| `/api/courses/upload` | POST | |
| `/api/comment-audio/upload` | POST | |
| `/api/booky/sso` | GET | Booky SSO token |
| `/api/bookings/[id]/ics` | GET | Calendar export |
| `/api/events/[id]/ics` | GET | |
| `/api/dev/login` | GET | Dev-only one-click sign-in |
| `/api/cron/event-reminders` | GET | Scheduled: `0 8 * * *` |
| `/api/cron/purge-archived-groups` | GET | Scheduled: `0 3 * * *` |
| `/api/cron/cleanup-old-content` | GET | Scheduled: `0 4 * * *` |

### Admin Routes (within `groups/[slug]/admin/`)

These are group-level admin routes, not a global super-admin panel. Gated by `requireRole(min: "ADMIN")` inside each page/action. See the protected app routes table above.

### Super-Admin Routes

**None exist.** There is no `/super-admin/` directory and no platform-level admin dashboard for Nadi (the SaaS operator).

### Auth Routes (under `(auth)/`)

`/login`, `/register`, `/verify` — listed in Public Routes above.

---

## Section 1.4 — Current Payment Integration

### Who Pays Whom

**Member → Tenant (group owner).** Payment flows:

1. Member clicks "Subscribe" on `/groups/[slug]/me`.
2. Client hits `GET /api/payments/checkout?planId=<id>`.
3. API redirects to `<PAYMENT_SYSTEM_URL>/subscribe/<plan.externalProductSlug>?email=…&plan=…` — the external **Subscription-base** platform (integrated with **Paymob** as the PSP).
4. External system captures payment, creates a subscription, fires `payment_success` webhook to `POST /api/webhooks/payment`.
5. Webhook activates local `Subscription` row and syncs `MemberAccess` GRANT records.

There is no Nadi-level billing. Nadi (the operator) does not collect fees from tenants via this system. The `Community.plan` field (FREE/PRO/ENTERPRISE) is set manually (or via the separate `User.canCreateGroups` flag) — there is no automated billing for tenant upgrades.

### Models Tracking Subscriptions

| Model | Purpose |
|---|---|
| `SubscriptionPlan` | Per-group plan definitions; maps to external `(productId, planType)` |
| `Subscription` | Per-user active/expired subscription; carries `externalSubscriptionId`, `paymobOrderId` |
| `MemberAccess` | Resource grants created/expired on subscription lifecycle events |
| `PlanResource` | Which channels/courses/events a plan unlocks |
| `PaymentWebhookEvent` | Idempotency log for all inbound webhooks |

### Webhook Endpoints

| Endpoint | Source | Events |
|---|---|---|
| `POST /api/webhooks/payment` | Subscription-base/Paymob | `payment_success`, `renewal_success`, `payment_failed`, `renewal_failed`, `cancel_requested`, `cancelled`, `expired` |
| `POST /api/stripe/webhook` | Stripe | `checkout.session.completed` (course enrollments only) |

### Payment Proof / Manual Approval

**Not implemented.** There is no manual payment proof upload flow, no pending approval queue for payments, and no admin UI for reviewing payment proofs. All activation flows through the automated webhook. Admins can manually extend subscriptions via `activateSubscriptionAction` from the admin member panel.

---

## Section 1.5 — Feature Inventory

| Feature | Status | Notes |
|---|---|---|
| **Multi-tenant layer (Tenant model)** | ⚠️ Partial | `Community` acts as tenant container but has no `tenantId` foreign key on child models; isolation is through Prisma relation chain only |
| **Plan tiers (PlanTier enum / `src/lib/plans.ts`)** | ✅ Full | `src/lib/plans.ts` defines `Plan = "FREE" | "PRO" | "ENTERPRISE"` with `PLAN_CONFIGS`; enforced on community group-count |
| **Plan limits enforcement** | ⚠️ Partial | `canCreateGroup()` enforced in `createGroupAction` and `assertCanCreateGroup`. **`canAddMember()` is defined but never called** — the member limit (100 for FREE) is not enforced anywhere |
| **Feature gating components** | ✅ Full | `MemberAccess` / `hasAccess()` / `hasAccessBulk()` in `src/server/access.ts`; tier=PREMIUM channels/courses/events are gated |
| **Subdomain routing (middleware.ts)** | ❌ Missing | `src/middleware.ts` has no subdomain logic; only cookie-session gate |
| **Custom payment methods per tenant** | ⚠️ Partial | Each group sets `SubscriptionPlan` rows pointing to external product IDs; but the payment system URL is a single global env var, not per-tenant |
| **Manual payment proof upload flow** | ❌ Missing | No upload flow, no proof model, no approval queue |
| **Pending approvals queue UI** | ⚠️ Partial | `/groups/[slug]/admin/requests` exists for group join requests (PRIVATE groups); no payment approval queue |
| **Auto-lock cron job** | ⚠️ Partial | No dedicated "auto-lock expired subscriptions" cron. Expiry is enforced at access-check time via `expiresAt` comparisons in `hasAccess()`. The `cleanup-old-content` cron exists but handles content retention, not subscription locking |
| **Tenant dashboard (separate from group admin)** | ⚠️ Partial | `/owner/dashboard` shows owned communities with stats; not a full tenant management console — no billing management, no plan upgrade UI |
| **Super admin dashboard (/super-admin routes)** | ❌ Missing | No `/super-admin/` route directory; no platform-level admin exists |
| **Tenant onboarding wizard** | ⚠️ Partial | `/create` wizard exists (community + first group); does not include plan selection, payment setup, or guided configuration |
| **Stripe integration for Nadi's own billing** | ❌ Missing | No mechanism for Nadi to bill tenants via Stripe; `User.canCreateGroups` is set manually |
| **Email notifications via Resend** | ✅ Full | Resend used for magic-link auth emails; `src/server/notifications.ts` exists for in-app; email delivery for notifications is conditional on `NotificationPreference` settings |
| **Tenant isolation middleware** | ❌ Missing | Middleware only checks session cookie; no tenant-scoping of requests |

---

## Section 1.6 — Files Impact List

### files-to-modify

| File | Why it needs changes |
|---|---|
| `prisma/schema.prisma` | No `tenantId` on any model; need to decide on explicit denormalization vs. relation-chain isolation. If subdomain routing is added, a `Tenant` model or `tenantSlug` on `Community` may be needed. |
| `src/middleware.ts` | Currently has no subdomain detection. Needs host-header parsing to route `<slug>.nadi.app` → tenant context. Risk of breaking existing cookie-based auth for cross-tenant requests. |
| `src/lib/plans.ts` | Prices are hardcoded display strings (`"$29/mo"`), not DB-driven. For Nadi to bill tenants, prices need to be tied to an actual payment product. |
| `src/server/groups.ts` | `joinGroupAction` calls `canAddMember` nowhere; needs member-limit enforcement on FREE plan. `createGroupAction` checks `canCreateGroups` flag but not the community plan group limit. |
| `src/server/community.ts` | `createCommunityAction` does not check `canCreateGroups` flag (only `createGroupAction` in `src/server/groups.ts` does). Needs consistent enforcement. |
| `src/server/actions/subscription.ts` | `syncSubscriptionAccessGrants` loops resources sequentially with individual `upsert` calls; should be batched for performance. |
| `src/server/auth.ts` | `session` callback fires a DB query on every session read (hydrates `handle` + `locale`); should be cached or moved to JWT strategy if session volume grows. |
| `src/app/api/webhooks/payment/route.ts` | `PAYMENT_WEBHOOK_SECRET` not enforced when unset (Phase 1 comment says "not enforced yet"). Must enforce in production. |
| `src/app/api/cron/purge-archived-groups/route.ts` | Uses `x-vercel-cron` header as an auth bypass path (`!isVercelCron && !secretOk`). The cleanup-old-content cron correctly requires `CRON_SECRET` always; this cron should match. |
| Every server action that creates Community/Group/Channel/Post/Course/Event | If a `tenantId` column is added to child models for direct isolation, all create paths must populate it and all query paths must filter by it. |

### files-to-create

| File | Purpose |
|---|---|
| `src/server/billing/nadi-plans.ts` | Plan definitions and checkout logic for Nadi billing tenants (separate from tenant-billing-members) |
| `src/server/billing/limits.ts` | Enforcement helpers called from join/create actions (extract `canAddMember` call sites here) |
| `src/app/super-admin/page.tsx` | Platform-level dashboard: list all tenants, override plans, view webhook log |
| `src/app/super-admin/tenants/[id]/page.tsx` | Per-tenant management page |
| `src/app/super-admin/layout.tsx` | Super-admin layout with platform-role gate |
| `src/app/api/super-admin/[...route]/route.ts` | API routes for super-admin actions |
| `src/server/actions/nadi-billing.ts` | Server actions for upgrading/downgrading tenant Community.plan |
| `src/app/(app)/owner/upgrade/page.tsx` | Tenant self-serve plan upgrade UI |
| `src/app/api/cron/lock-expired-subscriptions/route.ts` | Dedicated cron to flip `Subscription.status` to EXPIRED and lock `GroupMembership` for members whose `currentPeriodEnd` has passed (currently only enforced lazily at access-check time) |

---

## Section 1.7 — Conflicts & Risks

### What the Current Middleware Does

`src/middleware.ts` (59 lines):

1. Injects `x-pathname` header into every request (so server components can read the active route).
2. Checks a whitelist of public paths (`/`, `/login`, `/register`, `/verify`) and path prefixes (`/api/auth`, `/api/dev`, `/_next`, `/favicon`).
3. Checks for `authjs.session-token` or `__Secure-authjs.session-token` cookies.
4. Redirects unauthenticated non-public requests to `/login?callbackUrl=…`.

**No host-header inspection, no subdomain parsing, no tenant context injection.**

### Conflicts with Adding Subdomain Routing

| Issue | Detail |
|---|---|
| **Host-header unavailable in middleware signature** | `NextRequest.nextUrl` gives path only. Subdomain requires `req.headers.get("host")` or `req.nextUrl.hostname` — workable, but must be tested across Vercel preview domains. |
| **Public paths are path-based, not host-based** | `/` is public on the main domain but `/` on a subdomain should probably redirect to the group's landing page. The current `PUBLIC_PATHS` array has no concept of per-host overrides. |
| **Cookie domain mismatch** | `authjs.session-token` set on `nadi.app` won't be sent on `tenant.nadi.app` requests unless `NEXTAUTH_URL` / cookie domain is configured as `.nadi.app`. Requires NextAuth session cookie configuration changes. |
| **`x-pathname` injection** | The header forwarding at line 29 is fine; this doesn't conflict. |
| **No tenant resolution** | After parsing the subdomain, the middleware would need to look up `Community` by slug to inject a `x-tenant-id` header — but middleware is supposed to avoid DB calls. This creates a tension: either accept the DB call or use edge-cached lookups. |

### Queries Without tenantId Filtering (Spot-Check)

| File | Query | Risk |
|---|---|---|
| `src/server/groups.ts:joinGroupAction` | `db.group.findUnique({ where: { id } })` | Correctly scoped by groupId; no cross-tenant risk from this call alone, but a user could join any group regardless of tenant if they know the ID |
| `src/server/groups.ts:createGroupAction` | `db.community.findUnique({ where: { slug } })` | Scoped by slug; fine |
| `src/server/post-actions.ts:canWriteToChannel` | `db.channel.findUnique({ where: { id } })` | No tenant check — if a user knows a channelId from another tenant they could attempt to write to it (though membership check would block them) |
| `src/server/courses.ts` | `db.course.findUnique(...)` | Same pattern: channelId/courseId is passed directly from client; no tenant scope guard beyond the Prisma cascade checks |
| `src/server/access.ts:hasAccess` | Multiple `db.*.findFirst` by resourceId | `groupId` is always passed alongside; provides implicit scoping, but relies on caller supplying the correct groupId |
| `src/server/events.ts` | `db.event.findMany({ where: { groupId } })` | Scoped by groupId; fine — but groupId comes from client URL params with no tenant assertion |

**Pattern:** The entire codebase trusts that `groupId`, `channelId`, `courseId` etc. passed from URL params belong to the expected tenant. There is no middleware-level or action-level assertion that "this groupId belongs to the currently-scoped tenant." This is a tenant isolation gap.

### Hard-Coded Limits / Single-Tenant Assumptions

| Location | Issue |
|---|---|
| `src/lib/plans.ts:PLAN_CONFIGS` | Prices hardcoded as display strings; no Stripe/payment product IDs for Nadi-level billing |
| `src/lib/plans.ts:canAddMember` | Defined but **never called** anywhere in the codebase — FREE plan's 100-member limit is not enforced |
| `src/server/auth.ts` email template | Hardcoded "Sign in to Nadi" branding; would break white-label / multi-tenant branding |
| `src/app/(app)/create/page.tsx` | Hardcodes `nadi.app/c/` and `nadi.app/groups/` in the URL preview inputs — single-domain assumption |
| `src/server/auth.ts:magicLinkEmail` | Hardcodes `"Sign in to Nadi"` subject line and purple `#6d3691` button color |
| `process.env.PAYMENT_SYSTEM_URL` | Single global env var; cannot support per-tenant payment system configurations |

### Race Conditions / Missing Transactions

| Location | Issue |
|---|---|
| `src/server/groups.ts:joinGroupAction` | `findUnique` → `upsert` → `syncAllChannelsForGroup` → `maybeGrantFreeTrial` are four separate DB operations with no wrapping transaction. A concurrent double-join could create duplicate side effects. |
| `src/server/community.ts:createCommunityAction` | Pre-flight uniqueness checks (`findUnique` × 2) followed by `$transaction` — correctly uses transaction for the create, but the pre-checks are racy (mitigated by catching `P2002`). |
| `src/server/actions/subscription.ts:setPlanResourcesAction` | `deleteMany` + `createMany` inside `$transaction` is correct. The subsequent `for...of` loop over active subscribers runs outside the transaction — if the loop throws partway, some subscribers have updated grants and others don't. |
| `src/server/actions/subscription.ts:syncSubscriptionAccessGrants` | Sequential `upsert` calls in a `for...of` loop — no transaction, no batch. N DB round-trips for N plan resources per subscriber. |
| `src/app/api/webhooks/payment/route.ts` | `PaymentWebhookEvent.create` (idempotency row) runs before the activation side effects, but if the creation succeeds and then `handleActivation` throws, the event is marked `processed: false` (correct). However if the process crashes after `create` but before the `update`, the event remains unprocessed with no errorMessage — acceptable but worth noting. |
| `src/app/api/cron/purge-archived-groups/route.ts` | Auth check allows `x-vercel-cron` header alone (without `CRON_SECRET`) to authorize the request. The `cleanup-old-content` cron correctly requires `CRON_SECRET` always. This inconsistency is a security gap — any caller can send the `x-vercel-cron` header. |

---

## Summary: 5 Most Important Findings

### 1. No tenantId on any model — tenant isolation relies entirely on Prisma relation chains

**Impact: Critical for multi-tenancy.** The codebase has no `tenantId` column anywhere. All tenant scoping depends on the caller passing the correct `groupId`/`channelId` and Prisma following the relation chain. There is no middleware or action-layer assertion that a resource belongs to the currently-active tenant. Adding subdomain routing without also adding explicit tenant-scoping to queries would leave cross-tenant data leakage as a real risk.

### 2. `canAddMember()` is defined but never called — FREE plan member limit is unenforced

**Impact: Business logic gap.** `src/lib/plans.ts` defines a 100-member cap for FREE plan communities, and `canAddMember()` is exported, but `grep` confirms it is never invoked anywhere in the codebase. Any FREE community can accumulate unlimited members. The group-count limit (`canCreateGroup`) _is_ enforced. The member limit is silently missing.

### 3. No super-admin / platform-operator dashboard exists

**Impact: Major operational gap.** There is no `/super-admin` route, no platform-level role in the DB or session, and no way for Nadi to manage tenants, override plans, or view system-wide metrics without direct DB access. The `Community.plan` field can only be changed via direct DB writes or a script.

### 4. Middleware has no subdomain routing and auth cookies won't work across subdomains

**Impact: Blocks white-label feature.** The current middleware is path-only with no host header inspection. Adding `<slug>.nadi.app` subdomains requires both middleware changes and NextAuth cookie domain configuration (`NEXTAUTH_URL` must cover `.nadi.app`). The `authjs.session-token` cookie set on `nadi.app` is not sent to `tenant.nadi.app` by default.

### 5. Payment webhook signature enforcement is disabled in Phase 1 — must be fixed before production

**Impact: Security risk.** `src/app/api/webhooks/payment/route.ts` line 69: `if (!secret) return true; // not enforced yet (Phase 1)`. When `PAYMENT_WEBHOOK_SECRET` is not set, the webhook accepts any payload from any caller without verification. This allows an attacker to trigger subscription activations for arbitrary users. The comment acknowledges this, but it must be resolved before the system handles real payments.
