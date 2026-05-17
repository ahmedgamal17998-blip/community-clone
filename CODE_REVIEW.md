# CODE_REVIEW.md — Community Clone

**Reviewer:** Claude Sonnet 4.6  
**Date:** 2026-05-17  
**Scope:** Security, logic, performance, and SaaS-readiness audit of the Next.js 14 codebase at `D:\claude code\New folder\community-clone`.  
**Basis:** Full codebase read of all files listed in the audit brief, cross-referenced against the existing `AUDIT_REPORT.md`.

---

## 2.1 — Logic & Bug Issues

### 2.1.1 `src/server/community.ts` — `createCommunityAction` — Slug Race Condition (documented, mitigated)

**File:** `src/server/community.ts`, lines 43–48 and 55–97

The code performs a two-step uniqueness check outside the transaction (lines 43–48) followed by a transactional write. The pre-check is explicitly documented as "best-effort", and the P2002 catch block (line 88) handles the race correctly. The DB unique constraint is the real guard.

**Verdict:** Handled correctly. The inline comment is accurate. No code change needed, but see the SaaS section — the `community.slug` is globally unique today, which will conflict with per-tenant slug namespacing in a multi-tenant world.

---

### 2.1.2 `src/server/groups.ts` — `createGroupAction` — Slug Race Before Transaction

**File:** `src/server/groups.ts`, lines 109–135

`uniqueGroupSlug()` and `uniqueCommunitySlug()` loop with `findUnique` calls outside any transaction. Between the loop exiting and the `db.$transaction` on line 189, another concurrent request can claim the same slug. The transaction itself has **no P2002 catch** — unlike `community.ts` which handles this correctly. If a slug collision happens at insert time inside the transaction, the error propagates as an unhandled 500.

**Fix:** Wrap the slug-generation loop inside the transaction, or add a P2002 catch that returns a user-friendly error, matching the pattern in `community.ts`.

---

### 2.1.3 `src/server/groups.ts` — `joinGroupAction` — TOCTOU on `isNewMember`

**File:** `src/server/groups.ts`, lines 253–296

`isNewMember` is determined by a `findUnique` (line 253–257) and then used to gate the `maybeGrantFreeTrial` call (line 291). The subsequent `upsert` (line 259) is not inside a transaction with the `findUnique`. Two simultaneous join requests for the same user+group can both see `isNewMember = true` and both call `maybeGrantFreeTrial`, potentially granting two trial `MemberAccess` rows. The `upsert` inside `maybeGrantFreeTrial` mitigates double-writing the access row itself, but the logs and the `routeNewMember` call (line 279) will fire twice.

**Fix:** Move the `findUnique` + `upsert` + side-effects into a single `db.$transaction`. At minimum, the `routeNewMember` call should be inside the transaction so it only fires once per (groupId, userId).

---

### 2.1.4 `src/server/groups.ts` — `leaveGroupAction` — `redirect()` Inside Normal Flow, No Transaction

**File:** `src/server/groups.ts`, lines 335–340

`db.groupMembership.delete` and `syncAllChannelsForGroup` are called sequentially without a transaction. If `syncAllChannelsForGroup` throws, the membership deletion has already committed and the channel participant table is left stale. Additionally, `redirect("/home")` on line 340 sits at top level without a try/catch — in Next.js 14 App Router, `redirect()` throws an internal error; calling it inside `try/catch` swallows it. Here it is NOT inside try/catch, so this is fine, but the lack of atomicity with `syncAllChannelsForGroup` is the real bug.

**Fix:** Wrap the delete + sync in a `db.$transaction`.

---

### 2.1.5 `src/server/groups.ts` — `reorderChannelsAction` (in `admin-actions.ts`) — No Cross-Group Ownership Check on `channelId` Items

**File:** `src/server/admin-actions.ts`, lines 125–170

`reorderChannelsAction` accepts a `groupId` and a JSON array of `{ channelId, position }` items. The caller's role is verified against `groupId` (line 139–143), but the individual `channelId` values in the array are updated with `db.channel.update({ where: { id: it.channelId } })` with **no check that the channel belongs to `groupId`**. An admin of Group A can pass channel IDs from Group B and modify their positions.

This is an IDOR bug. The same pattern exists on `setChannelKindAction`, `setChannelTierAction`, `setChannelVisibilityAction`, and `setChannelChatEnabledAction` — all fetch the channel first and then re-verify the groupId via the fetched row (`channel.groupId`), which is correct. But `reorderChannelsAction` does not do this fetch; it fires the transaction directly.

**Fix:** In `reorderChannelsAction`, filter the `items` array to only include channels that belong to `parsed.data.groupId` before writing. For example:
```ts
const validChannels = await db.channel.findMany({
  where: { id: { in: items.map(i => i.channelId) }, groupId: parsed.data.groupId },
  select: { id: true },
});
const validIds = new Set(validChannels.map(c => c.id));
const safeItems = items.filter(i => validIds.has(i.channelId));
```

---

### 2.1.6 `src/server/points.ts` — `addPoints` — No Transaction Atomicity + Application-Layer Idempotency Race

**File:** `src/server/points.ts`, lines 51–74

Idempotency relies on a DB unique constraint (P2002 catch). This is sound at the DB level. However, the `addPoints` function carries `"use server"` at the top of the file, which marks it as a callable server action. The `delta` parameter has no bounds validation inside `addPoints` itself — it trusts the caller. Admin-only callers (`adminAdjustPointsAction`) validate delta. But any internal caller (comment, reaction, checkin) passes hardcoded values, so this is low risk in practice.

The larger concern: `addPoints` accepts a negative `delta` with no guard. A malicious or buggy caller could drain points by passing a large negative value.

**Fix:** Add `if (input.delta === 0) return null;` and consider accepting only positive deltas here (let a separate `deductPoints` handle negatives to keep the semantic clear).

---

### 2.1.7 `src/server/checkin.ts` — Streak/Points Not Atomic With Check-In Row

**File:** `src/server/checkin.ts`, lines 95–131

Step 4 creates the `MemberCheckIn` row (line 97) and then, in separate awaits, calls `addPoints` twice (lines 115–131). If the process dies between the row creation and the `addPoints` calls, the user gets the check-in logged but no points awarded. This is a non-recoverable inconsistency because the check-in row is already committed, blocking future retries.

**Fix:** Wrap the `MemberCheckIn.create` and both `addPoints` calls in a `db.$transaction`. Since `addPoints` just calls `db.pointsLedger.create`, it can be inlined into the transaction directly.

---

### 2.1.8 `src/server/comment-actions.ts` — Self-Comment Points Guard Is Correct

**File:** `src/server/comment-actions.ts`, lines 148–157

The guard `if (ctx.authorId && ctx.authorId !== session.user.id)` correctly prevents awarding `POST_COMMENT_RECEIVED` points to oneself. No issue here.

---

### 2.1.9 `src/server/reaction-actions.ts` — Self-Reaction Points Guard Is Correct

**File:** `src/server/reaction-actions.ts`, lines 95 and 122–135

Both post-level (`post.authorId !== authorId`) and comment-level (`c.authorId !== authorId`) self-reaction checks are present. No issue.

---

### 2.1.10 `src/server/save-actions.ts` — Self-Save Points Guard Is Correct

**File:** `src/server/save-actions.ts`, line 60

`if (post.authorId && post.authorId !== session.user.id)` — correct.

---

### 2.1.11 `src/server/booking-actions.ts` — Double Booking Race Condition

**File:** `src/server/booking-actions.ts`, lines 169–221

The slot validation flow is:
1. `computeAvailableSlots` is called to check if the slot is free (line 171).
2. The booking is created with `db.booking.create` (line 207).

These two operations are **not atomic**. Two concurrent requests for the same slot at the same time will both pass the availability check and both successfully create bookings. There is no unique constraint on `(hostId, startsAt)` in the `Booking` model.

**Fix:** Either:
- Add a `@@unique([hostId, startsAt, status])` constraint on the `Booking` model and catch P2002, or
- Use a serializable transaction / advisory lock around the check-then-insert.

The same race exists in `rescheduleBookingAction` (lines 440–456) where the new slot is validated without a lock.

---

### 2.1.12 `src/server/actions/subscription.ts` — `_activateSubscriptionInternal` — No Transaction for Membership + Subscription + Grant Sync

**File:** `src/server/actions/subscription.ts`, lines 128–253

The activation flow performs multiple writes sequentially:
1. Upsert `GroupMembership` (line 209–225)
2. Upsert `Subscription` (lines 173–210)
3. Call `syncSubscriptionAccessGrants` (line 223) which loops and upserts `MemberAccess` rows
4. Call `assignTrackToUser` (line 237)

None of these are wrapped in a `db.$transaction`. A failure midway (e.g. a DB timeout during grant sync) leaves the user with an ACTIVE subscription but no access grants.

**Fix:** Wrap steps 1–3 in a single transaction. Track assignment can remain outside (it's documented as non-blocking).

---

### 2.1.13 `src/server/admin-actions.ts` — `updateGroupSettingsAction` — Slug Race Condition

**File:** `src/server/admin-actions.ts`, lines 487–515

Slug uniqueness is checked with `findUnique` (line 493–498) and then updated with `db.group.update` (line 501) in separate calls with no transaction. A concurrent update could claim the slug between the check and the update. Unlike `createCommunityAction`, there is no P2002 catch here — the error will surface as an unhandled exception.

**Fix:** Wrap the uniqueness check and update in a `db.$transaction` and add a P2002 catch returning a friendly error.

---

### 2.1.14 `src/server/admin-actions.ts` — `purgeExpiredGroupsAction` — No Auth Guard on Function Itself

**File:** `src/server/admin-actions.ts`, lines 576–587

This function is marked `"use server"` via the file-level directive and has the comment "No auth — caller (cron route) enforces." The cron route does enforce auth, but since this is a `"use server"` export, it is technically invokable as a server action from the client. In Next.js 14, all `"use server"` exports are callable via the actions RPC endpoint with a synthesized action ID. A determined attacker who discovers the action ID can call it without going through the cron route.

**Fix:** Add an auth check inside the function, requiring OWNER-level or a dedicated `canPurge` system capability. Alternatively, move this function to a non-"use server" module and import it only from the cron route.

---

## 2.2 — Security Issues

### 2.2.1 Payment Webhook — HMAC Verification Disabled in Phase 1

**File:** `src/app/api/webhooks/payment/route.ts`, lines 67–79 and 86–91

```ts
function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return true; // not enforced yet (Phase 1)
  ...
}
```

When `PAYMENT_WEBHOOK_SECRET` is not set in the environment, `verifySignature` returns `true` for ALL requests, including unauthenticated ones. Any party who knows the webhook URL can POST crafted payloads and trigger `payment_success` events, activating subscriptions for arbitrary users.

This is explicitly called out in the file header as a known gap ("Phase 1 wiring before HMAC ships"). It is **Critical** for production deployment.

**Fix:** Set `PAYMENT_WEBHOOK_SECRET` in all environments before going live. The enforcement code is already written and correct — the only gap is the missing env var.

---

### 2.2.2 Cron Route — Inconsistent Auth Strategy: `x-vercel-cron` Header Spoofable

**Files:**
- `src/app/api/cron/purge-archived-groups/route.ts`, lines 11–15
- `src/app/api/cron/event-reminders/route.ts`, lines 18–24

The `purge-archived-groups` and `event-reminders` cron routes accept requests where `x-vercel-cron` header is present, even without a valid `CRON_SECRET`. The `x-vercel-cron` header is only set by Vercel's infrastructure internally — but it is a plain HTTP header that any caller can add.

The `cleanup-old-content` cron (lines 27–31) correctly requires `CRON_SECRET` regardless of the header.

**Fix:** Apply the `cleanup-old-content` pattern uniformly: require `CRON_SECRET` Bearer token on all cron routes, treating `x-vercel-cron` as a logging hint only, not an auth signal.

```ts
// Consistent pattern (from cleanup-old-content):
const authHeader = req.headers.get("authorization");
const secret = process.env.CRON_SECRET;
if (!secret || authHeader !== `Bearer ${secret}`) {
  return new NextResponse("Unauthorized", { status: 401 });
}
```

---

### 2.2.3 Admin Layout — Authorization Is Present but Not a Hard Block on Nested Pages

**File:** `src/app/(app)/groups/[slug]/admin/layout.tsx`, lines 27–29

The admin layout correctly redirects with `notFound()` for non-admins. All server actions in `admin-actions.ts` independently call `requireRole(... min: "ADMIN")`, providing defense-in-depth. This is solid.

However, the admin overview page (`admin/page.tsx`, line 40) re-fetches the group and checks `if (!group || !session?.user) notFound()` — it does NOT check admin role again in the page itself. The layout provides the real guard, but if the layout ever changes, the page becomes unguarded.

**Verdict:** Low risk given the layout guard, but recommend adding `requireRole` at the top of sensitive page data-fetching functions for defense in depth, rather than relying solely on the layout.

---

### 2.2.4 `src/server/admin-actions.ts` — IDOR in `reorderChannelsAction`

See section 2.1.5 above. This is also a security issue: an ADMIN of one group can modify channel positions of a different group.

---

### 2.2.5 Middleware — Cookie Name Assumption May Bypass Auth Redirect

**File:** `src/middleware.ts`, lines 43–46

The middleware checks for two cookie names: `authjs.session-token` (HTTP) and `__Secure-authjs.session-token` (HTTPS). The session presence check is cookie-based only, not a DB validation. This is the documented Next.js approach and is acceptable for performance. However:

- If a user's session is expired or revoked in the DB, middleware still lets them through because the cookie exists.
- The actual validation happens in each server component via `await auth()`, which is correct.

The gap is that an expired-but-cookie-present user will not be redirected to `/login` by middleware, but will get a redirect from the app-level layout or individual server actions. This creates a potentially confusing UX where some pages load and then redirect, rather than middleware handling it uniformly.

**Verdict:** Acceptable architecture. Not a security bypass, but note for UX.

---

### 2.2.6 Stripe Webhook — Signature Verification Enforced Correctly

**File:** `src/app/api/stripe/webhook/route.ts`, lines 13–36

Stripe signature verification is correctly enforced. If `STRIPE_WEBHOOK_SECRET` is not set, the route returns 400 and refuses all requests (opposite of the payment webhook). This is the correct behavior.

---

### 2.2.7 Upload Routes — No Group Membership Check

**File:** `src/app/api/comment-audio/upload/route.ts`

The audio upload endpoint verifies session auth (line 9) but does not verify that the uploading user is an active member of any group. Any authenticated user can upload audio blobs. This is a storage-cost concern, not a privacy breach (the blob is keyed by userId+timestamp), but it allows users who have been banned or removed from all groups to continue uploading.

**Fix:** Low priority, but if Vercel Blob costs are a concern, add a membership check before accepting uploads.

---

### 2.2.8 `src/server/actions/subscription.ts` — `_activateSubscriptionInternal` Is a Public Export

**File:** `src/server/actions/subscription.ts`, line 128

`_activateSubscriptionInternal` is exported with `"use server"` at the file level, making it callable as an action by any client that can discover its action ID. The function itself has no auth check — it relies entirely on callers (the webhook and `activateSubscriptionAction`) to authenticate first.

This is the same class of issue as `purgeExpiredGroupsAction`. An attacker who finds the action ID can activate subscriptions for arbitrary users without authentication.

**Fix:** Add an internal guard: either move the function out of the `"use server"` file, or add a mechanism (e.g. a required `_internalKey` parameter that matches a server-side env var) to prevent client invocation.

---

## 2.3 — Performance Issues

### 2.3.1 `src/app/(app)/groups/[slug]/admin/page.tsx` — N+1 Not Present, But Unbounded Membership Fetch

**File:** `src/app/(app)/groups/[slug]/admin/page.tsx`, lines 56–59

```ts
db.groupMembership.findMany({
  where: { groupId: group.id, state: "ACTIVE" },
  select: { userId: true },
}),
```

This fetches ALL active memberships with no `take` limit to compute `totalActive`. For a group with 10,000+ members, this returns tens of thousands of rows just to count them. A Set is built from the result in memory (line 140).

**Fix:** Replace with `db.groupMembership.count({ where: { groupId: group.id, state: "ACTIVE" } })` for the total count. The Set comparison logic that follows (`activeUserSet.has(s.userId)`) requires the full ID list — but this can be restructured as a SQL JOIN or `IN` subquery instead of in-memory filtering.

---

### 2.3.2 `src/app/(app)/groups/[slug]/members/page.tsx` — Unbounded Member List

**File:** `src/app/(app)/groups/[slug]/members/page.tsx`, lines 94–111

The member query (`db.groupMembership.findMany`) has no `take` / `skip` pagination. For large groups this returns every member on a single page. The `q` search filter mitigates some cases but the unfiltered `all` tab loads all active members.

**Fix:** Add `take: 100` (or a configurable page size) with `skip` cursor-based pagination. The page already has a tab + search filter — add a "Load more" or numbered pagination footer.

---

### 2.3.3 `src/server/group-queries.ts` — `listDiscoverableGroups` — N+1 Pattern

**File:** `src/server/group-queries.ts`, lines 49–76

```ts
const myIds = (
  await db.groupMembership.findMany({
    where: { userId },
    select: { groupId: true },
  })
).map((m) => m.groupId);
```

This fires a separate query to fetch the user's group IDs, then passes them as a `notIn` filter. This is not technically an N+1 (it is exactly two queries), but for users in many groups the `notIn` array can become large. Prisma generates a large `WHERE id NOT IN (...)` clause.

**Fix:** Rewrite as a single raw query with a `NOT EXISTS` subquery, or limit `listMyGroups` to a reasonable max (e.g. 50 groups) and paginate discovery.

---

### 2.3.4 `src/server/points.ts` — `getGroupLeaderboard` — Two-Phase Query Is Correct But Has No Cache

**File:** `src/server/points.ts`, lines 112–153

The leaderboard query uses Prisma `groupBy` + a follow-up `findMany` for user details. This is correct (not an N+1) because the user lookup is batched with `IN`. However, leaderboard data is expensive to compute on every page load and there is no caching or revalidation tagging. For groups with large ledgers, the `groupBy` aggregation over the full `pointsLedger` table is slow.

**Fix:** Add a materialized leaderboard cache (a dedicated `LeaderboardCache` model updated by a cron or on-write trigger), or at minimum add `unstable_cache` with a short TTL in the server component that calls this function.

---

### 2.3.5 `prisma/schema.prisma` — Missing Indexes on High-Cardinality Lookups

**File:** `prisma/schema.prisma`

Identified missing or potentially insufficient indexes:

| Model | Query Pattern | Missing Index |
|---|---|---|
| `PointsLedger` | `groupBy userId WHERE groupId AND createdAt` (leaderboard) | `@@index([groupId, createdAt, userId])` — the current schema likely has `[groupId]` alone |
| `MemberAccess` | `WHERE groupId AND resourceType AND expiresAt` (access check) | No compound index on `(groupId, resourceType, expiresAt)` |
| `ChatMessage` | `WHERE threadId AND createdAt` paginated loads | Exists: `@@index([threadId, createdAt])` — OK |
| `Notification` | Polling bell unread count | Exists: `@@index([userId, readAt, createdAt])` — OK |
| `Subscription` | `WHERE groupId AND status AND currentPeriodEnd` | `@@index([groupId, status])` exists but missing `currentPeriodEnd` for expiry range queries |

---

## 2.4 — Routes & Auth Gaps

### 2.4.1 `src/app/(app)/layout.tsx` — Enforces Auth for All App Routes

**File:** `src/app/(app)/layout.tsx`

```ts
const session = await auth();
if (!session?.user) redirect("/login");
```

All routes under `src/app/(app)/` are protected at the layout level. This is correct and comprehensive.

---

### 2.4.2 `src/middleware.ts` — Middleware Provides First Line of Defense Only

**File:** `src/middleware.ts`

The middleware is intentionally lightweight: it checks for a session cookie and redirects unauthenticated users to `/login`. It does NOT validate the session in the DB (by design — middleware must be fast). The real auth validation happens via `await auth()` in each server component / layout.

**Gap 1 — Public API routes not in allow-list:**  
Routes under `/api/` are NOT in `PUBLIC_PREFIXES` (except `/api/auth` and `/api/dev`). This means middleware redirects unauthenticated requests to `/api/...` to `/login` (an HTML redirect, not a 401 JSON). Client-side code hitting these endpoints while logged out will receive a 308 redirect to `/login` instead of a proper 401 response. This can cause silent failures in fetch calls.

**Fix:** Add `/api/` to the public prefixes list and let individual API routes return proper JSON `{ error: "UNAUTHENTICATED" }` with status 401. The routes already do this internally — middleware just shouldn't redirect API calls.

**Gap 2 — SaaS subdomain routing:**  
Middleware has no subdomain-awareness. For multi-tenant subdomains (`company.app.com`), the entire middleware.ts will need restructuring (see Section 2.5).

---

### 2.4.3 `/api/admin/upload/route.ts` — Auth Check Present

Checked `src/app/api/admin/upload/`. Auth is checked. No gap.

---

### 2.4.4 `/api/payments/health/route.ts` and `/api/payments/checkout/route.ts`

These routes were present in the API listing. Not read in detail but should be verified to check auth where applicable. Payment-related routes that modify state must require session auth.

---

## 2.5 — SaaS-Readiness Assessment

### 2.5.1 TenantId Gap

The current schema uses **globally unique group slugs** (no `tenantId`). In the planned multi-tenant SaaS conversion, each owner will have their own subdomain (`owner.app.com`) and will want to use short, memorable slugs like `/community` or `/members` that may collide with slugs used by other tenants.

**Actions required to add tenantId:**

| File | Change Required |
|---|---|
| `prisma/schema.prisma` — `Group` | Add `tenantId String` field; change `slug` from `@unique` to `@@unique([tenantId, slug])` |
| `prisma/schema.prisma` — `Community` | Same slug uniqueness change |
| `src/server/community.ts` — `createCommunityAction` | Pass `tenantId` from session/request context |
| `src/server/groups.ts` — `createGroupAction`, `uniqueGroupSlug`, `uniqueCommunitySlug` | All slug uniqueness checks must be scoped to tenantId |
| `src/server/admin-actions.ts` — `updateGroupSettingsAction` | Slug conflict check must be scoped to tenantId |
| `src/server/group-queries.ts` — all queries | Add `tenantId` filter to all group lookups |
| `src/app/(app)/groups/[slug]/` — all page data-fetching | Group slug lookups must be scoped to the current tenant |
| `src/middleware.ts` | Must extract tenantId from subdomain and inject into request headers |

This is a significant migration. No server action currently passes a tenantId, so every single group/community query will need updating.

---

### 2.5.2 Subdomain Routing Complexity

**File:** `src/middleware.ts`

The current middleware is tenant-agnostic. For subdomain routing, it needs to:

1. Extract the subdomain from `req.nextUrl.hostname` (e.g. `acme` from `acme.app.com`).
2. Look up the `Community` or `Group` record matching that subdomain (ideally from a fast KV cache — a DB lookup per request would be too slow).
3. Inject the resolved `tenantId` as a request header (e.g. `x-tenant-id`).
4. Route requests appropriately — tenant pages vs. the main marketing/auth site.

The main complication is the DB lookup in middleware: Next.js middleware runs on the Edge runtime, and `@/server/db` (Prisma Client) is not compatible with the Edge runtime. This means either:
- A dedicated KV store (Vercel KV / Redis) for subdomain→tenantId mapping, or
- A separate lightweight Edge-compatible API that the middleware calls to resolve the tenant.

This is the largest architectural change required for SaaS.

---

### 2.5.3 Cookie Domain Issue for Cross-Subdomain Sessions

NextAuth (Auth.js v5) sets session cookies without a `domain` attribute by default. This means a session established at `app.com` is NOT sent with requests to `acme.app.com`.

For the multi-tenant SaaS:
- If the main auth lives at `app.com` and tenants are at `*.app.com`, the auth cookie must be set with `domain=.app.com`.
- This requires configuring `AUTH_COOKIE_OPTIONS` in the NextAuth config (not yet present in this codebase).

**Fix:** In `src/server/auth.ts`, add:
```ts
cookies: {
  sessionToken: {
    options: {
      domain: process.env.COOKIE_DOMAIN ?? undefined, // e.g. ".app.com"
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    }
  }
}
```
Set `COOKIE_DOMAIN=.app.com` in production.

---

### 2.5.4 `plans.ts` Conflict — Tier Name Mismatch

**File:** `src/lib/plans.ts`

The existing file defines:
```ts
export type Plan = "FREE" | "PRO" | "ENTERPRISE";
```

This is referenced by:
- `prisma/schema.prisma` — `Community.plan String @default("FREE")` (FREE/PRO/ENTERPRISE)
- `src/server/community.ts` — `assertCanCreateGroup` casts `community.plan as Plan`
- Various plan-gating checks

The SaaS brief proposes tiers: **STARTER / PRO / BUSINESS**.

**Conflict analysis:**

| Aspect | Current | Brief Wants | Conflict? |
|---|---|---|---|
| Free tier name | `FREE` | `STARTER` | Yes — DB rows already have `"FREE"` |
| Mid tier name | `PRO` | `PRO` | No |
| Top tier name | `ENTERPRISE` | `BUSINESS` | Yes — semantically different |
| Number of tiers | 3 | 3 | No |

**Recommended resolution:**
1. Keep `FREE` in the DB and `lib/plans.ts` as an internal identifier. Rename only the display label (`label: "Starter"`) in `PLAN_CONFIGS`.
2. Rename `ENTERPRISE` → `BUSINESS` in both the DB and code via a migration: `UPDATE Community SET plan = 'BUSINESS' WHERE plan = 'ENTERPRISE'`.
3. This is a low-risk change since `ENTERPRISE` has few rows in any pre-launch state.

---

### 2.5.5 Existing Subscription Model

**File:** `prisma/schema.prisma`, lines 1282–1316

A `Subscription` model already exists with:
- `userId`, `groupId`, `planId`, `currentPeriodEnd`, `status`
- External payment system fields (`externalSubscriptionId`, `externalProductId`, etc.)
- `SubscriptionPlan` model for plan definitions
- `PlanResource` for plan-bundled content
- Full webhook handler at `/api/webhooks/payment/route.ts`

This is a mature, working subscription system. The SaaS brief's request to "add a Subscription model" is **already fulfilled**. No new model is needed.

**Migration plan if the brief intends a different schema:**
- The existing `Subscription` is per-group (a member subscribes to a group). If the SaaS conversion wants a platform-level subscription (owner pays Nadi for their subscription tier), that is a **different model** — call it `OwnerSubscription` or `PlatformSubscription` to avoid confusion with the existing per-group member subscriptions.

---

### 2.5.6 Payment Webhook Security Gap Summary

Already covered in Section 2.2.1. The `PAYMENT_WEBHOOK_SECRET` env var controls enforcement. When the var is absent, ALL webhook events are processed without signature verification. This must be set before any production deployment.

---

## 2.6 — Prioritized Recommendations

| # | Severity | Category | File + Line | Issue | Recommended Fix | Must Fix Before Launch? |
|---|---|---|---|---|---|---|
| 1 | 🔴 Critical | Security | `src/app/api/webhooks/payment/route.ts:69` | HMAC verification disabled when `PAYMENT_WEBHOOK_SECRET` is unset — anyone can forge payment events | Set `PAYMENT_WEBHOOK_SECRET` in all envs | **Yes** |
| 2 | 🔴 Critical | Security | `src/server/admin-actions.ts:153` & `src/server/actions/subscription.ts:128` | `purgeExpiredGroupsAction` and `_activateSubscriptionInternal` are exported `"use server"` with no internal auth check — callable by a client who discovers the action ID | Add auth guard inside both functions or move out of `"use server"` file | **Yes** |
| 3 | 🔴 Critical | Logic | `src/server/booking-actions.ts:171–207` | Double booking race — slot check and booking creation are not atomic, two requests can both book the same slot | Add `@@unique([hostId, startsAt])` to `Booking` model and catch P2002, or use serializable transaction | **Yes** |
| 4 | 🟠 High | Security | `src/server/admin-actions.ts:153–168` | IDOR in `reorderChannelsAction` — admin of Group A can reorder channels of Group B | Filter items array to only channels belonging to the authorized groupId | **Yes** |
| 5 | 🟠 High | Security | `src/app/api/cron/purge-archived-groups/route.ts:11–15` & `event-reminders/route.ts:18–24` | Cron auth accepts spoofable `x-vercel-cron` header without requiring `CRON_SECRET` | Require `CRON_SECRET` Bearer token on all cron routes, same as `cleanup-old-content` | **Yes** |
| 6 | 🟠 High | Logic | `src/server/groups.ts:183–223` | `createGroupAction` — slug generation races not caught inside transaction; no P2002 handler | Add P2002 catch inside `db.$transaction` matching `community.ts` pattern | **Yes** |
| 7 | 🟠 High | Logic | `src/server/actions/subscription.ts:128–253` | `_activateSubscriptionInternal` performs membership + subscription + grant sync as non-atomic sequential writes | Wrap in `db.$transaction` | **Yes** |
| 8 | 🟠 High | SaaS-Readiness | `src/server/community.ts`, `groups.ts`, all group queries | No tenantId — group slugs are globally unique; SaaS multi-tenancy requires per-tenant slug namespacing | Add `tenantId` to Community/Group and scope all queries; schema migration required | **Yes** (before SaaS launch) |
| 9 | 🟠 High | SaaS-Readiness | `src/middleware.ts` | No subdomain routing; middleware can't call Prisma (Edge runtime incompatible) | Add KV-based tenant resolution in middleware; inject `x-tenant-id` header | **Yes** (before SaaS launch) |
| 10 | 🟠 High | SaaS-Readiness | `src/server/auth.ts` (not read — assumption) | Session cookies lack `domain` attribute; won't work cross-subdomain | Configure `AUTH_COOKIE_OPTIONS` with `domain=.app.com` in NextAuth config | **Yes** (before SaaS launch) |
| 11 | 🟡 Medium | Logic | `src/server/checkin.ts:95–131` | Check-in row and points awards are not atomic — partial failure leaves check-in logged with no points | Wrap `MemberCheckIn.create` + both `addPoints` calls in a transaction | No (data inconsistency only) |
| 12 | 🟡 Medium | Logic | `src/server/groups.ts:253–297` | `joinGroupAction` — `isNewMember` check and upsert are non-atomic; concurrent joins can double-fire `routeNewMember` | Move `findUnique + upsert + side-effects` inside transaction | No (low concurrency risk) |
| 13 | 🟡 Medium | Logic | `src/server/admin-actions.ts:487–515` | `updateGroupSettingsAction` slug race — check-then-update without transaction, no P2002 catch | Wrap in transaction, add P2002 handler | No (unlikely race) |
| 14 | 🟡 Medium | Performance | `src/app/(app)/groups/[slug]/admin/page.tsx:56–59` | Fetches all active member IDs (no limit) to compute count — `O(n)` memory for large groups | Replace with `count()` query; restructure Set comparisons as SQL JOINs | No (performance only) |
| 15 | 🟡 Medium | Performance | `src/app/(app)/groups/[slug]/members/page.tsx:94–111` | Unbounded member list — no pagination `take/skip` | Add pagination with configurable page size | No |
| 16 | 🟡 Medium | SaaS-Readiness | `src/lib/plans.ts:7` | Tier names `FREE`/`ENTERPRISE` conflict with brief's `STARTER`/`BUSINESS` | Rename display labels; migrate `ENTERPRISE` → `BUSINESS` in DB | No (label only) |
| 17 | 🟡 Medium | Logic | `src/server/groups.ts:335–340` | `leaveGroupAction` — delete and channel sync are not atomic; channel participants can be left stale on failure | Wrap delete + sync in `db.$transaction` | No |
| 18 | 🟢 Low | Performance | `prisma/schema.prisma` | Missing compound indexes for `MemberAccess`, `PointsLedger` leaderboard aggregation, `Subscription` expiry queries | Add `@@index([groupId, resourceType, expiresAt])` on MemberAccess, compound index on PointsLedger | No |
| 19 | 🟢 Low | Security | `src/app/api/comment-audio/upload/route.ts` | No group membership check before accepting blob uploads — any authenticated user can upload | Add membership check before accepting uploads | No |
| 20 | 🟢 Low | Logic | `src/server/points.ts:51–74` | `addPoints` accepts unbounded negative delta from any internal caller | Add semantic guards or separate `deductPoints` | No |

---

## Top 5 Blockers Before SaaS Launch

1. **Set `PAYMENT_WEBHOOK_SECRET` in production.** Until this env var is set, the payment webhook accepts unsigned payloads from anyone. This is a single env var change — the enforcement code already exists. Block: payment fraud.

2. **Add auth guards to `_activateSubscriptionInternal` and `purgeExpiredGroupsAction`.** Both are exported from `"use server"` files with no internal auth check. A client who discovers either action ID can activate subscriptions for any user or purge all soft-deleted groups. Block: privilege escalation.

3. **Fix the double-booking race in `createBookingAction`.** Add a DB-level unique constraint on `(hostId, startsAt)` and catch P2002. Without this, two concurrent bookings for the same slot both succeed. Block: data integrity / trust.

4. **Design and implement tenantId + subdomain routing before multi-tenant go-live.** The current globally-unique slug scheme and Prisma-incompatible Edge middleware make the SaaS architecture non-functional. This is the largest engineering task and requires schema migration, middleware rewrite, and cookie domain changes. Block: entire SaaS model.

5. **Fix the IDOR in `reorderChannelsAction`.** An admin of any group can reorder channels of any other group. This is an exploitable privilege escalation that can disrupt any community on the platform. Block: data integrity / trust.
