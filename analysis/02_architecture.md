# Phase 2 — Architecture

> Draws on `01_platform_audit.md`. Target: full ClientClub/Skool parity (12 milestones, see `03_roadmap.md`).

---

## 1. Stack decisions (and why)

| Layer | Choice | Why this over alternatives |
|---|---|---|
| **Framework** | Next.js 14 App Router + TypeScript (strict) | Server Components keep the feed/profile cheap; Route Handlers = one codebase for pages + API; Vercel-native. |
| **Styling** | Tailwind CSS + shadcn/ui + Radix primitives | Matches target's utility-driven look; shadcn gives accessible primitives we own (no black-box CSS). |
| **State / data** | tRPC + React Query | End-to-end type safety; no hand-written fetchers; React Query gives us optimistic UI for reactions/comments for free. |
| **DB** | PostgreSQL (Neon serverless) + Prisma 5 | Relational fits the graph (users×groups×channels×posts) cleanly; Neon branches = per-PR DBs; Prisma migrations are version-controlled. |
| **Auth** | NextAuth v5 (email magic link + Google OAuth) | Free, self-hosted, mirrors `sso.clientclub.net` UX; can swap to Clerk later if DX ever hurts. |
| **Realtime** | Pusher Channels (feed updates, notifications, presence, chat typing) | Managed, generous free tier, first-class presence channels. Alternative considered: Supabase Realtime (rejected — would require migrating the whole DB). |
| **File storage** | Vercel Blob (MVP) → swap to R2/GCS later | Zero-config for M1–M8; migrate if egress bills bite. Source uses GCS — we match the *pattern*, not the vendor. |
| **Rich text** | TipTap (ProseMirror) | Best React integration, easy mentions/polls extensions, matches what Circle/Skool use. |
| **i18n / bidi** | `next-intl` + Tailwind `rtl:` variants | Non-negotiable — the group mixes Arabic and English inline. CSS logical properties throughout. |
| **Calendar** | `@schedule-x/react` (or `react-big-calendar`) | Replicates day/week/month toggle seen in Events tab. |
| **Video** | HTML5 `<video>` + Mux/Bunny later | Signed-URL proxy in Route Handler; upgrade when we add paid courses. |
| **Email / SMS** | Resend (email) · Twilio (SMS invites) | Matches platform's invite flows. |
| **Google Calendar + Meet** | `googleapis` SDK + OAuth2 (Calendar + Meet scopes) | Required for bookings: create events with `conferenceData.createRequest` auto-generates Meet links. Per-user refresh tokens stored in `GoogleAccount`. |
| **ICS fallback** | `ics` package | For non-Google invitees — email an `.ics` attachment so their calendar (Outlook/Apple) still picks up the booking. |
| **Payments (M11+)** | Stripe (Subscriptions + Connect) | Standard for memberships + affiliate commissions. |
| **Testing** | Vitest + Playwright | Unit for utilities; E2E for critical flows (signup → post → react → comment → DM). |
| **Lint / format** | Biome | Faster than ESLint+Prettier, one config. |
| **Deploy** | Vercel (app) + Neon (DB) + Pusher (WS) + Resend (mail) | All have free/dev tiers; one-command deploys. |

### Stack trade-offs explicitly considered

- **tRPC vs REST** — picked tRPC for velocity + type safety. If we ever need native mobile clients, a REST layer can sit alongside tRPC's procedures (they compile down to the same handlers).
- **NextAuth vs Clerk** — Clerk has better DX but $25/mo past 10k MAU and a hard vendor lock. NextAuth is free and lets us own the user table. For an iteratable clone, ownership wins.
- **Pusher vs Supabase Realtime vs Socket.io self-hosted** — Pusher for managed simplicity and presence channels. Self-hosted would be ~30% of M5–M8 effort for marginal gain.

---

## 2. Folder structure

```
community-clone/
├── analysis/                       # Phase 1 + 2 deliverables
├── app/                            # Next.js App Router
│   ├── (auth)/                     # /login, /signup, /verify
│   ├── (marketing)/                # public landing
│   ├── (app)/                      # authenticated shell
│   │   ├── layout.tsx              # global top nav + theme + i18n provider
│   │   ├── home/page.tsx
│   │   ├── chat/
│   │   │   ├── page.tsx            # inbox
│   │   │   └── [threadId]/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── search/page.tsx
│   │   ├── profile/[handle]/page.tsx
│   │   ├── settings/page.tsx
│   │   └── communities/
│   │       └── groups/
│   │           └── [slug]/
│   │               ├── layout.tsx          # group shell: left sidebar + tabs + right rail
│   │               ├── home/page.tsx       # Discussion tab
│   │               ├── learning/page.tsx   # Learning tab (course grid)
│   │               ├── events/page.tsx     # Events tab (calendar)
│   │               ├── members/page.tsx    # Members directory
│   │               ├── about/page.tsx
│   │               ├── channels/[channelSlug]/page.tsx
│   │               ├── posts/[postId]/page.tsx
│   │               ├── courses/[courseSlug]/page.tsx
│   │               ├── courses/[courseSlug]/[lessonId]/page.tsx
│   │               ├── events/[eventId]/page.tsx
│   │               ├── invite/page.tsx
│   │               └── admin/
│   │                   ├── page.tsx
│   │                   ├── members/page.tsx
│   │                   ├── channels/page.tsx
│   │                   ├── requests/page.tsx
│   │                   ├── branding/page.tsx
│   │                   └── settings/page.tsx
│   └── api/
│       ├── trpc/[trpc]/route.ts
│       ├── auth/[...nextauth]/route.ts
│       ├── webhooks/pusher/route.ts
│       └── upload/route.ts
├── src/
│   ├── server/
│   │   ├── db.ts                   # Prisma singleton
│   │   ├── auth.ts                 # NextAuth config
│   │   ├── pusher.ts               # server-side Pusher client
│   │   ├── trpc/
│   │   │   ├── context.ts
│   │   │   ├── root.ts
│   │   │   └── routers/
│   │   │       ├── user.ts
│   │   │       ├── group.ts
│   │   │       ├── channel.ts
│   │   │       ├── post.ts
│   │   │       ├── comment.ts
│   │   │       ├── reaction.ts
│   │   │       ├── member.ts
│   │   │       ├── chat.ts
│   │   │       ├── notification.ts
│   │   │       ├── course.ts
│   │   │       ├── event.ts
│   │   │       └── admin.ts
│   │   └── services/               # business logic (points, presence, mentions)
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── layout/                 # AppShell, GroupShell, LeftSidebar, RightRail, TopNav
│   │   ├── post/                   # PostCard, PostComposer, CommentTree, ReactionBar
│   │   ├── chat/                   # ChatInbox, ChatThread, MessageBubble
│   │   ├── members/                # MemberRow, MemberFilters, PresenceDot
│   │   ├── events/                 # EventCalendar, EventCard, RSVPButton
│   │   ├── courses/                # CourseCard, LessonPlayer, LessonList
│   │   └── notifications/          # NotificationBell, NotificationList
│   ├── hooks/
│   ├── lib/
│   │   ├── pusher-client.ts
│   │   ├── permissions.ts          # canPost(), canModerate(), channel ACL
│   │   ├── handle.ts               # @handle generator
│   │   └── points.ts               # leaderboard scoring
│   ├── i18n/                       # messages/{en,ar}.json
│   └── styles/
│       └── globals.css
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
├── tests/
│   ├── unit/
│   └── e2e/
├── .env.example
├── .env.local                      # gitignored
├── package.json
└── README.md
```

---

## 3. Database schema (final v1)

See `01_platform_audit.md §5` for the full Prisma draft — it is the canonical schema and will be the starting `prisma/schema.prisma`. Notable decisions locked in:

- **5-tier `GroupRole`** (`OWNER / ADMIN / CONTRIBUTOR / MEMBER / —`) + orthogonal `MembershipState` (`REQUESTED / ACTIVE / BANNED`) rather than stuffing `REQUESTED` / `BANNED` into the role enum. Keeps role = authority, state = lifecycle.
- **`Channel` is a first-class entity**, and `Post.channelId` is required. A "group feed" is a virtual view across all channels the user can read.
- **Chat is separate from DM history on posts** — `ChatThread` + `ChatMessage` handle the top-right Chat button. Notifications and mentions link to posts/comments, not to chat.
- **`Presence`** is a single-row-per-user table updated via a debounced heartbeat from a Pusher presence channel (so the DB isn't hammered).
- **Points ledger** is append-only (`PointsLedger`) and the leaderboard is a windowed aggregate query — no denormalized counter, so rules can evolve without backfills.
- **Polymorphic `Notification.entityRef`** stored as `{type}:{id}` (e.g., `post:abc123`). Good-enough indirection without Prisma-unfriendly polymorphic relations.

---

## 4. API surface (tRPC routers)

All procedures are Zod-validated and return typed DTOs.

```ts
// user
user.me()                                 // current session user + profile
user.updateProfile({ bio, socials, ... })
user.getByHandle({ handle })

// group
group.list()                              // groups the user is in
group.getBySlug({ slug })
group.create({ name, primaryColor, ... })  // admin
group.update(...)                          // owner / admin
group.softDelete({ id })                   // owner
group.restore({ id })                      // owner

// channel
channel.listForGroup({ groupId })
channel.create({ groupId, name, type })    // admin
channel.update(...); channel.delete(...)
channel.grantAccess({ channelId, userId | role })

// membership
member.list({ groupId, state, role, q })   // paginated, matches 5 filter tabs
member.request({ groupId })                // join request
member.approve({ membershipId })           // admin
member.ban({ membershipId, reason })       // admin
member.unban({ membershipId })             // admin
member.changeRole({ membershipId, role })  // owner/admin

// post
post.feed({ groupId, channelId?, cursor })  // infinite scroll
post.byId({ id })
post.create({ groupId, channelId, body, media, poll? })
post.update({ id, ... })
post.delete({ id })
post.pin({ id, value })

// comment
comment.treeForPost({ postId })
comment.create({ postId, parentId?, body })
comment.update({ id, body })
comment.delete({ id })

// reaction
reaction.toggle({ targetType, targetId, type })

// chat — covers DM, ad-hoc group threads, AND built-in per-channel chat rooms
chat.inbox()                               // DIRECT + GROUP threads (personal messages)
chat.channelThread({ channelId })          // CHANNEL thread (auto-provisioned with the channel)
chat.thread({ threadId })                  // messages paginated
chat.sendMessage({ threadId, body, media })
chat.startDirect({ withUserId })
chat.markRead({ threadId })

// booking + google integration
google.connect()                           // returns OAuth consent URL (Calendar + Meet scopes)
google.disconnect()
google.status()                            // is the user connected + which scopes
availability.get({ userId })
availability.upsert({ rules, timezone, slotMinutes, ... })
booking.availableSlots({ hostId, from, to })   // computed from Availability ∩ busy (via Google freeBusy)
booking.create({ hostId, startsAt, endsAt, title, description })
                                           //   → writes Google Event + Meet link (if host has GoogleAccount)
                                           //   → emails ICS fallback to non-Google invitee
booking.cancel({ bookingId })              // removes Google event on both sides
booking.listMine({ role: 'host' | 'invitee' })

// notification
notification.list({ cursor })
notification.markAllRead()
notification.unreadCount()

// course
course.list({ groupId })
course.get({ slug })
course.createLesson(...); course.updateLesson(...)
course.recordProgress({ lessonId, completed })

// event
event.list({ groupId, from, to })
event.create({ groupId, title, startsAt, endsAt, ... })
event.rsvp({ eventId, status })

// admin
admin.requests({ groupId })                // pending membership requests
admin.stats({ groupId })                   // members / posts / admin counts
admin.updateBranding({ groupId, primaryColor, logoUrl, coverUrl })
```

---

## 5. Real-time strategy (Pusher)

| Event | Channel | Used by |
|---|---|---|
| `post.created` / `post.updated` / `post.deleted` | `private-group-{groupId}` | Feed (inject/update/remove card, optimistic-UI rollback) |
| `comment.created` / `comment.deleted` | `private-post-{postId}` | Post detail thread |
| `reaction.toggled` | `private-post-{postId}` | Reaction bar animated count |
| `chat.message` | `private-thread-{threadId}` | DM / group / channel-chat thread body |
| `chat.typing` | `private-thread-{threadId}` | Typing indicator |
| `chat.read` | `private-thread-{threadId}` | Read receipts |
| `booking.created` / `booking.cancelled` | `private-user-{userId}` | Bell + toast for host and invitee |
| `notification.created` | `private-user-{userId}` | Bell badge + toast |
| `presence.*` | `presence-group-{groupId}` | Online dots in member directory & chat |

Presence channel subscription in `layout.tsx` drives the `Presence` table writes (server listens to `member_added` / `member_removed` webhooks).

---

## 6. Permissions model

One source of truth in `src/lib/permissions.ts`:

```ts
type Action =
  | 'group.edit' | 'group.delete'
  | 'channel.create' | 'channel.delete'
  | 'channel.post'        // channel-scoped: PUBLIC = any member, PRIVATE = access-granted
  | 'post.pin' | 'post.delete.any'
  | 'member.approve' | 'member.ban' | 'member.changeRole'
  | 'course.create' | 'event.create'

function can(action: Action, ctx: {
  user: SessionUser
  group: Group
  membership: GroupMembership | null
  channel?: Channel
  targetPost?: Post
}): boolean
```

Matrix (simplified):
- **OWNER** → all
- **ADMIN** → all except `group.delete`
- **CONTRIBUTOR** → `post.create`, `channel.post` (incl. some private), `post.delete.own`, `event.create` (pending confirmation — marked TODO)
- **MEMBER** → `channel.post` (public only), `post.create.own`, `post.delete.own`, `comment.create`, `reaction.toggle`
- **REQUESTED** → read only on public channels of the group's landing; cannot post
- **BANNED** → no access; short-circuit at middleware

---

## 7. Internationalization + RTL

- `next-intl` with `en.json` and `ar.json` bundles
- `<html lang dir>` set per-request from cookie
- Tailwind `rtl:` variants + CSS logical properties (`ps-4`, `pe-4`, `ms-auto`) instead of directional (`pl-4`, `ml-auto`) everywhere
- Post bodies render with `dir="auto"` so mixed Arabic/English paragraphs flow correctly (matches the source behavior in screenshot 1)
- Dates localized with the user's locale; calendar week-start configurable

---

## 8. Security model

- NextAuth sessions in HTTP-only cookies, CSRF tokens on all mutations
- tRPC middleware enforces: `requireSession` → `requireMembership(groupId)` → `requirePermission(action)`
- Rate limits on mutations (Upstash Redis token bucket): posts 30/hr, comments 120/hr, reactions 600/hr, DMs 300/hr
- All user HTML sanitized server-side (DOMPurify) before storing rich text
- File uploads: MIME sniff + size cap + virus scan (Vercel Blob does basic checks; revisit at M12)
- Ban list check runs in the tRPC context middleware — banned users see a 403 page regardless of route

---

## 9. Observability

- **Product analytics:** PostHog (self-hostable; matches Pendo's role in source)
- **Errors:** Sentry (browser + server)
- **Logs:** Vercel logs + Pino for structured server logs
- **Uptime:** Better Stack

---

## 10. Deploy topology

```
   ┌─────────────┐      ┌────────────┐
   │  Vercel     │──────│  Neon (PG) │
   │  (Next.js)  │      └────────────┘
   │             │──────┐
   └─────┬───────┘      │
         │              ▼
         │        ┌──────────┐
         │        │  Pusher  │  ← WebSockets
         │        └──────────┘
         │
         ▼
   ┌─────────────┐   ┌──────────┐   ┌─────────┐
   │ Vercel Blob │   │  Resend  │   │ Twilio  │
   │ (files)     │   │  (email) │   │  (SMS)  │
   └─────────────┘   └──────────┘   └─────────┘
```

- Preview deploys per PR with an ephemeral Neon branch seeded from the base branch
- `main` → production; tags → release notes auto-generated from `CHANGELOG.md`

---

## 11. Out of scope for v1

Deferred to post-M12 explicitly so you can push back if any should move in:

- Native mobile app (the PWA is the mobile story for v1)
- Paid memberships + Stripe Connect for affiliate commissions (big surface; M12+ or its own phase)
- Conversation AI / SMS / IG DM unification (HighLevel-scale feature)
- Custom domain automation (the *capability* ships; the UI to manage DNS records is a later polish)
- Server-side search indexing (Postgres FTS is enough for v1; move to Typesense/Meilisearch when member count demands it)

---

## 12. Open design questions flagged to reader

These map 1:1 to the 🔴 rows in `01_platform_audit.md §8`. The build will include sensible-default implementations marked `// TODO(parity)` so you can replace them once you send the extra screenshots:

1. **Contributor** role's exact permissions
2. Reaction set (single ❤️ vs multi-reaction)
3. Leaderboard presence + scoring rules
4. Channel creation — who can do it
5. Private channel access model (role vs invite)
6. Event RSVP states (going/maybe/declined only, or richer?)
7. Onboarding flow on first login
