# Nadi

> **Get in touch, learn and build your own Network and career.**

A monetized community platform — Skool / ClientClub-style — built from the
ground up. Members join groups, watch courses, attend events, chat in
real time, and pay to unlock premium content. Admins run their own brand
under one roof.

- **Live:** [https://community-clone.vercel.app](https://community-clone.vercel.app)
- **Stack:** Next.js 14 · TypeScript (strict) · Prisma 5 · Neon Postgres · Vercel
- **Real-time:** Pusher · Calendar: Google + Meet · Payments: custom Paymob integration via [Subscription-base](https://github.com/ahmedgamal17998-blip/Subscription-base)

---

## Features

### Communities
- Multi-group hierarchy (`Community → Group → Channels`), 4-tier roles
  (OWNER / ADMIN / CONTRIBUTOR / MEMBER), per-group theming, granular
  admin permissions (`AdminPermission.capabilities`).
- Visibility: PUBLIC / PRIVATE / HIDDEN. Private groups gate join via
  REQUESTED → ACTIVE flow with admin approval.
- Group branding: logo, cover, favicon, primary color (HSL picker),
  configurable login popup + leave-attempt retention popup.

### Channels
- PUBLIC / PRIVATE / ANNOUNCEMENT kinds, drag-to-reorder, archive.
- Per-channel access control: PRIVATE channels gate via grants;
  PREMIUM channels gate via active subscription / trial.
- Optional inline chat per channel (admin toggle: `chatEnabled`).

### Posts
- Rich-text composer (TipTap) with @mentions, bold/italic/lists/code.
- Reactions (5 emojis with hover popover), nested comments (depth 4),
  pinned posts, share menu, save-for-later.
- Posts in premium / locked channels are hidden from non-subscribers'
  feeds.

### Chat
- DMs (1-on-1), group chats, channel chats — all share `ChatThreadView`.
- Pusher live delivery, typing indicators, read receipts, voice notes,
  media attachments (Vercel Blob), pinned messages, swipe-to-reply
  (mobile, WhatsApp-style).
- Members can DM only when subscribed / in trial; admins always can.

### Courses (Learning)
- Modules → lessons, drip release rules, progress tracking, video
  embeds (YouTube / Vimeo / HTML5 fallback).
- FREE / PREMIUM tier, course-level publish toggle on the outline.
- Multi-rule access: CHANNEL / TENURE / ROLE_LEVEL / PAID / MANUAL.

### Events
- Day / week / month calendar, RSVP, recurrence (full RFC 5545 rrule),
  ICS download, 24h + 1h reminders via cron.
- Audience targeting: ALL / CHANNEL / COURSE / ROLE / specific MEMBER.
- Google Booking + Meet — availability editor, slot computation,
  reschedule, guest booking via HMAC token (no account needed).
- Mobile member-facing tab gates behind subscription; only admins
  can create events.

### Monetization
- `SubscriptionPlan` per group, multi-plan support per user, plan-bundled
  resource grants (`PlanResource`).
- Free trial on join (admin-configured days).
- External payment system: Subscription-base / Paymob bridge —
  `/api/payments/checkout` redirects, `/api/webhooks/payment` consumes
  events (signed HMAC), `/api/payments/cancel` proxies admin actions.
- Paymob-managed subs hide the local `Pause` action (Paymob has no
  pause-billing API) — admin uses `Cancel billing` instead.

### Notifications
- @mentions, reactions, replies, RSVPs, bookings, chat — all routed
  through `Notification` + per-type `NotificationPreference`.
- Email (Resend) + in-app bell (live via Pusher, polling fallback).

### Admin tooling
- Per-member panel: access matrix, expiry editor, subscription actions,
  login history, **access diagnostics** (trial state + manual grant
  buttons).
- Bulk member ops, role / ban management, channel reorder, branding
  editor, payment-integration health check.

### i18n + theming
- English + Arabic, full RTL flip via `next-intl`.
- Light / dark mode via `next-themes`.

---

## Setup

Requires **Node 20+** and **npm**.

```bash
# 1. Install deps (also runs `prisma generate`)
npm install

# 2. Create your env file
cp .env.example .env.local
# (fill required values — see "Environment" below)

# 3. Push the schema to your DB
npm run db:push

# 4. Seed dev users
npm run db:seed

# 5. Start the dev server
npm run dev              # → http://localhost:3000
```

### Sign-in during dev
- **Magic link** — enter any seeded email on `/login`. With
  `AUTH_RESEND_KEY` empty, the URL prints to the server console.
- **Google OAuth** — set `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`.
- **One-click dev login** (set `DEMO_MODE=1`) — visit
  `/api/dev/login?email=alex@example.com`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (also `prisma generate`) |
| `npm run start` | Serve the production build |
| `npm run db:push` | Apply Prisma schema to DB |
| `npm run db:migrate` | Create + apply a named migration |
| `npm run db:reset` | Drop and recreate (dev only) |
| `npm run db:seed` | Reseed dev users |
| `npm run db:studio` | Prisma Studio on `localhost:5555` |
| `npm run lint` | Next ESLint |
| `npm run typecheck` | `tsc --noEmit` |

---

## Environment

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PRISMA_URL` | Neon pooled connection |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations) |
| `AUTH_SECRET` | NextAuth secret (32 bytes) |
| `AUTH_RESEND_KEY` | Email delivery (magic link, invites, reminders) |
| `EMAIL_FROM` | Default `Nadi <onboarding@resend.dev>` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google sign-in |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (uploads, voice, media, video) |
| `CRON_SECRET` | Cron auth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Calendar + Meet OAuth |
| `GOOGLE_OAUTH_REDIRECT_URL` | `https://<host>/api/google/callback` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — wraps refresh tokens |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` | Real-time |
| `PAYMENT_SYSTEM_URL` | Subscription-base host (Paymob bridge) |
| `PAYMENT_SYSTEM_ADMIN_KEY` | Admin API key for cancel-proxy |
| `PAYMENT_WEBHOOK_SECRET` | HMAC-SHA256 secret for inbound webhook verification |
| `DEMO_MODE` | `1` enables the dev one-click login button |

---

## Architecture overview

```
src/
├── app/
│   ├── (app)/                 Authenticated app shell (TopNav)
│   │   ├── groups/[slug]/     Discussion · Learning · Events · …
│   │   ├── chat/              DMs + group chats
│   │   ├── settings/          Profile · Devices · Availability …
│   │   ├── bookings/          Booking detail + ICS
│   │   └── owner/archive/     Soft-delete restore
│   ├── (auth)/
│   ├── (marketing)/           Landing
│   └── api/
│       ├── webhooks/payment/  Subscription-base inbound bridge
│       ├── payments/          checkout · cancel · health
│       ├── notifications/     Bell + unread
│       ├── chat/              Inbox + per-channel unread
│       ├── google/            Calendar OAuth
│       ├── cron/              Daily reminders + purges
│       └── dev/login          DEMO_MODE only
├── server/
│   ├── access.ts              Canonical hasAccess + hasGroupSubscriptionAccess
│   ├── actions/subscription.ts Plan + Subscription + grant sync
│   ├── permissions.ts         Roles
│   ├── capabilities.ts        Granular admin caps
│   ├── chat.ts · posts.ts · events.ts · courses.ts …
│   └── notifications.ts · invite-actions.ts · …
└── components/                post · chat · group · courses · events · admin
```

**Core abstractions**

- `MemberAccess` (polymorphic GRANT/DENY by `(resourceType, resourceId)`)
  is the canonical access record. `hasAccess()` resolves it in priority
  order: explicit DENY → direct GRANT → group-level GRANT (trial / blanket)
  → active subscription → tier-aware default.
- `Subscription` rows are matched against `PlanResource` to issue grants
  on activation; pause / cancel revokes them.
- Free trial = a GROUP-level GRANT with `expiresAt = now + freeTrialDays`,
  fired on the user's first ACTIVE moment in the group.

---

## Project status

The platform has shipped the core community + monetization stack
(M1 → M27). Active areas of work after that point are scoped by direct
feedback rather than the original milestone roadmap — see Git history
for the running log.

## Legal

Placeholder branding only. No logos, trademarks, or copyrighted content
from any reference platform are reproduced.
