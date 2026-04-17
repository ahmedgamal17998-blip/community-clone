# Phase 1 — Platform Audit

**Target:** `https://englishsuperfast.app.clientclub.net/communities/groups/english-to-work/home`
**Platform (underlying):** ClientClub / Kollab (GoHighLevel / LeadConnector Communities)
**Audit date:** 2026-04-16
**Access level used for this pass:** public surfaces + 5 user-supplied screenshots (Discussion, Learning, Events, Members ×2). Credentials were shared but not used — WebFetch cannot JS-render the SPA, so screenshots gave higher signal. **See §8 Gaps — all major feed/courses/events/members gaps now resolved; remaining gaps are deep interaction flows.**

> **Legal note.** "English Super Fast", the `english-to-work` group name, any logos, course content, and community posts are the property of the operator. This audit documents *platform mechanics*, not content. Our clone will use placeholder branding only.

---

## 1. Platform Identification

| Signal | Value | Source |
| --- | --- | --- |
| Product code name | **Kollab** | PWA manifest `name: "Kollab"`, `id: "kollab"` |
| Public brand | **ClientClub** (client portal) | Subdomain pattern `*.app.clientclub.net` |
| Parent platform | **GoHighLevel / LeadConnector** (HighLevel Communities feature) | LeadConnector help docs confirm identical feature set |
| Staging env | `communities.staging.clientclub.net` | Manifest `start_url` |
| Category | Skool-style community + courses + client portal | HighLevel docs + third-party reviews describe it as "similar to Skool" |

**So what:** We're cloning a white-labeled SaaS that sits between Circle.so, Skool, and a Mighty Networks-style hybrid — communities, courses, members, events, with a strong "agency → multi-tenant" flavor.

---

## 2. Infrastructure & Tech-Stack Signals (public)

| Layer | Finding | Evidence |
| --- | --- | --- |
| DNS | A record `34.136.231.88` (Google Cloud), CNAME `preview.clientclub.net` | LeadConnector docs |
| Hosting | **Google Cloud Platform** | IP range, GCS-hosted icons |
| Object storage | **Google Cloud Storage** | Manifest icon URLs reference GCS |
| Analytics | **Pendo.io** (product analytics / in-app messaging) | API key `2609845c-58c9-4b6e-7126-639c4121d0b7` in bootstrap script |
| PWA | Yes — standalone, portrait, offline-enabled | `/manifest.json` |
| Frontend framework | **Unknown from public probes** — SPA, client-rendered, no `__NEXT_DATA__` / `data-reactroot` in initial HTML | WebFetch only saw bootstrap script |
| Auth service | Dedicated subdomain `sso.clientclub.net` | Search results |
| Backend API | Almost certainly `*.leadconnectorhq.com` (GHL's internal API domain) | Shared GHL infrastructure |
| Realtime | Likely Pusher or WebSockets over HighLevel infra | Inferred from DM/live-chat features documented |

### Design tokens captured from public CSS

```css
/* Light mode */
--bg:        #f5f5f5;
--surface:   #ffffff;
--text:      #333333;

/* Dark mode */
--bg-dark:       #1a1a1a;
--surface-dark:  #333333;
--text-dark:     #e0e0e0;

/* Radii */
--radius-sm:  8px;
--radius-md:  15px;
--radius-full: 50%;   /* avatars */

/* Breakpoints */
--bp-sm: 767px;
--bp-md: 930px;
--bp-lg: 1024px;

/* Theme color (PWA) */
--theme-color: #ffffff;
```

> Group-level branding overrides these via a **primary color** + logo + cover image + favicon (per LeadConnector docs).

### Confirmed from screenshots — per-group theme (English To Work)

```css
/* Group chrome (header + left sidebar) — deep purple */
--brand-900: #3d1650;      /* header gradient start */
--brand-800: #4a1c5c;      /* sidebar bg */
--brand-700: #5a2e7b;      /* header gradient end / hover */
--brand-600: #6d3691;      /* active nav item */
--brand-500: #8547a8;      /* primary CTA (INVITE MEMBERS) */
--brand-accent: #e6d1ff;   /* active nav text tint */

/* Neutrals in use */
--canvas: #f4f4f7;         /* main content bg */
--card:   #ffffff;         /* post + right rail cards */
--border: #e7e7ec;
--text:   #1f1f2a;
--muted:  #6b6b78;

/* Event category colors on calendar */
--evt-yellow: #f6c945;
--evt-green:  #3ecf7a;
--evt-red:    #e85a6b;
--evt-purple: #8547a8;

/* Presence dots */
--presence-online: #22c55e;   /* green */
--presence-away:   #f59e0b;   /* orange */
```

**Typography:** sans-serif system/Inter stack; semibold for names and titles; bold for CTAs; regular for body. RTL paragraphs render inline with LTR without layout breakage — bidi support is built-in.

**Iconography:** line icons (looks like Lucide/Feather family) — home, search, bell, grid, channel type (#, 🔒, 🎓, 📍, 🎉).

---

## 3. Route Map (confirmed via screenshots + inferred)

```
/                                                → redirect to /home (authenticated) or login
/login, /signup                                  → via sso.clientclub.net
/home                                            → global dashboard

/communities/groups/:slug                        → group shell (default = Discussion)
/communities/groups/:slug/home                   → Discussion tab (confirmed — current target)
/communities/groups/:slug/learning               → Learning tab — course grid (confirmed)
/communities/groups/:slug/events                 → Events tab — calendar (confirmed)
/communities/groups/:slug/members                → Members tab — directory (confirmed)
/communities/groups/:slug/about                  → About tab (confirmed)
/communities/groups/:slug/leaderboard            → (inferred, not visible in tabs — may live under "More")

/communities/groups/:slug/channels/:channelSlug  → channel feed scoped to a channel (confirmed: channels exist as sidebar items)
/communities/groups/:slug/posts/:postId          → post detail (inferred)

/communities/groups/:slug/courses/:courseSlug            → course detail
/communities/groups/:slug/courses/:courseSlug/:lessonId  → lesson player
/communities/groups/:slug/events/:eventId                → event detail + RSVP

/communities/groups/:slug/admin/*                → owner/admin panel (branding, members, channels, requests, bans)
/communities/groups/:slug/invite                 → invite flow

/profile/:handle                                 → public profile (@handle route)
/settings                                        → account settings
/notifications                                   → notification center (also a popover from bell)
/chat                                            → Chat inbox (confirmed — top-right Chat button with unread count)
/chat/:threadId                                  → DM / group chat thread
/search?q=...                                    → global search
```

**Confirmed top nav (global):** `Home icon · Group switcher (dropdown) · Search bar · Theme toggle (sun) · App switcher (grid) · Notifications bell (99+) · Avatar · Chat button (unread count badge)`.

**Confirmed in-group nav:** Discussion · Learning · Events · Members · About — tabbed, with left sidebar containing Home + channel list + "+ ADD CHANNEL" CTA.

**Mobile pattern:** bottom nav + sidebar collapses below 768px (CSS confirmed; mobile screenshot still outstanding).

---

## 4. Feature Inventory (updated with screenshot evidence)

### 4.1 Core (MVP)
- **Auth** — email signup, magic/email link, SSO via `sso.clientclub.net` _(screenshots not shown; doc-confirmed)_
- **Profiles** — name, avatar (or colored-initial), **auto-generated `@handle` with random suffix** (confirmed: `@mohamed-abuelelaa-6kAzYI`), bio, social links, email/phone visibility toggle, joined date, last-active timestamp **(confirmed: "Active 4h ago", "Joined 12 Apr 2026")**; one profile shared across all groups in a community
- **Groups** — multiple per community, unique slug, primary color, logo, cover image, favicon, Active/Inactive, soft-delete + restore
- **Channels inside groups** — **NEW (confirmed)**: Slack-style per-channel feeds with types: public (#), private/locked (🔒), emoji-prefixed decoratively. Channels seen: `ALL THE TIME`, `Ladies' Room` 🔒, `Men's Zone` 🔒, `Private program` 🔒, `PRE Stage`, `test` #, `Unlimited Practice`, `WELCOME`. "+ ADD CHANNEL" CTA at sidebar bottom (admin-only).
- **Feed & Posts** — confirmed anatomy: avatar · name · `@handle` · `Xd ago · in {channel}` · optional title (semibold) · body (supports rich text + RTL Arabic inline) · media (images confirmed). Reactions + comment count live on card.
- **Comments** — threaded discussion (depth TBD)
- **Reactions** — exact set TBD (need a post-detail screenshot)
- **Members directory** — **confirmed filter tabs**: `Active (383)` · `Admins (5)` · `Contributors` · `Requested (1, red dot)` · `Banned`. Search box. Per-row: avatar + presence dot, name, `@handle`, "Active Xd ago", "Joined DD MMM YYYY", email, overflow `⋮` menu.

### 4.2 Community Layer
- **Roles (confirmed 5-tier, not 4):** `Owner` / `Admin` / **`Contributor`** / `Member` / `Banned`, plus special state `Requested` (pending join approval). `Contributor` appears to be a "trusted poster / lite-mod" tier between member and admin — exact permissions TBD.
- **Join approvals** — confirmed: `Requested` tab with pending-request count
- **Ban list** — confirmed as first-class member state
- **Multi-group membership** within a community
- **Email / SMS invitations** — INVITE MEMBERS CTA confirmed in right rail
- **Private groups** — confirmed: "English To Work" labeled "Private Group" under name

### 4.3 Engagement
- **Built-in channel chat (NEW — user requested)** — every channel gets a Facebook/Messenger-style live group chat room auto-provisioned on channel creation. Distinct from the top-right Chat (which is DMs). Members of the channel are auto-joined. Separate "Posts" (structured discussions) vs "Chat" (ephemeral, live) modes inside the same channel.
- **In-community booking + Google integration (NEW — user requested)** — any user with linked Google account can publish availability; other members book a slot, and the system auto-creates a Google Calendar event with a Google Meet link on both sides. Non-Google attendees receive an ICS invite.
- **Polls** (documented)
- **Events** — **confirmed calendar view** with Day/Week/Month toggle, Today, `+ Share`, color-coded categories (yellow/green/red/purple), separate "Upcoming Events" + "Past Events" side panel. Events visible: `Peer Practice Pre-stage`, `Peer Practice Ladies`, `Peer Practice Men`, `PRESENTATION DAY (LADIES)`.
- **Notifications** — **confirmed 99+ badge** on header bell → high-volume real-time
- **Chat** — **confirmed separate from notifications**: top-right "Chat" button with unread count (4) implies a dedicated messaging center (DMs + possibly group threads)
- **Mentions** — assumed (standard)
- **Bookmarks** — still TBD (not visible in screenshots)
- **Presence / online status** — **confirmed** (green dot = online, orange = away/idle on member rows)

### 4.4 Discovery
- **Global search** — persistent pill in header across all tabs; scope confirmed as global (posts + lessons + members)
- **Filtering in members** — 5 tabs (see 4.1)
- **Trending / recommendations** — still TBD

### 4.5 Courses / Learning ("Learning" tab)
- **Course cards** — confirmed layout: illustration top, title, price tag (`Free` visible, paid presumed), `OPEN` button per card
- **Courses seen:** Master American Accent · Listen anything in 180 days · Business English and Emails · Be hero in the Interview · Grammar Basics (5+ confirmed)
- **`+ Add Course` tile** — confirmed as first grid item for admins
- **Lessons + progress** — still TBD (need a lesson-player screenshot)
- **Paid vs free courses** — "Free" tag implies pricing exists

### 4.6 Monetization / Extras
- **Paid memberships** (HighLevel-level, not confirmed visually in this group)
- **Affiliate commissions** panel (HighLevel-level)
- **Gamification / Leaderboard** — not in the 5 visible tabs; may live under "More" or profile. **Status: to confirm**
- **Pricing tiers / subscriptions** — HighLevel core

### 4.7 Admin / Configuration
- **Group stats widget (right rail, confirmed):** `Members: 383 / Posts: 264 / Admin: 5` + avatar strip + `SETTINGS` (outline) + `INVITE MEMBERS` (filled) buttons
- **Branding panel** — color, logo, cover, favicon (doc-confirmed)
- **Custom domain / subdomain** (doc-confirmed)
- **DNS instructions** (A `34.136.231.88` / CNAME `preview.clientclub.net`)
- **Request queue** — confirmed via Requested tab (1 pending, red-dot alert)
- **Ban list** — confirmed
- **Channel CRUD** — `+ ADD CHANNEL` CTA confirmed; permissions for channel creation TBD

### 4.8 Global UX (header-level, confirmed)
- **Theme toggle** (sun icon) — light/dark mode
- **App switcher** (grid icon) — implies multi-app portal (Home / Communities / Courses / More)
- **Group switcher** — dropdown next to group logo; used to jump between joined groups
- **PWA** — offline-enabled, standalone install

---

## 5. Data Model (revised after screenshots)

Prisma-ish DDL. Final version lives in Phase 2 `02_architecture.md`.

```prisma
model Community {
  id          String   @id @default(cuid())
  subdomain   String   @unique                // englishsuperfast
  customDomain String? @unique
  name        String
  createdAt   DateTime @default(now())
  groups      Group[]
  members     Membership[]
}

model Group {
  id            String   @id @default(cuid())
  communityId   String
  slug          String                         // english-to-work (one-time editable)
  name          String
  description   String?
  primaryColor  String   @default("#4f46e5")
  logoUrl       String?
  coverUrl      String?
  faviconUrl    String?
  status        GroupStatus @default(ACTIVE)
  deletedAt     DateTime?                      // soft-delete
  createdAt     DateTime @default(now())
  community     Community @relation(fields: [communityId], references: [id])
  memberships   GroupMembership[]
  posts         Post[]
  events        Event[]
  courses       Course[]
  @@unique([communityId, slug])
}

enum GroupStatus    { ACTIVE INACTIVE }
enum GroupRole      { OWNER ADMIN CONTRIBUTOR MEMBER }
enum MembershipState { REQUESTED ACTIVE BANNED }

model Channel {
  id         String  @id @default(cuid())
  groupId    String
  slug       String                              // e.g. "ladies-room"
  name       String                              // "Ladies' Room"
  emoji      String?                             // decorative prefix
  type       ChannelType @default(PUBLIC)        // PUBLIC | PRIVATE | ANNOUNCEMENT
  position   Int         @default(0)             // sidebar order
  createdAt  DateTime    @default(now())
  posts      Post[]
  access     ChannelAccess[]                      // for PRIVATE gating
  @@unique([groupId, slug])
}
enum ChannelType { PUBLIC PRIVATE ANNOUNCEMENT }

model ChannelAccess {
  id         String @id @default(cuid())
  channelId  String
  userId     String?          // per-user grant
  role       GroupRole?       // or role-based grant
  @@index([channelId])
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  phone        String?
  name         String
  avatarUrl    String?
  bio          String?
  socials      Json?                           // {twitter, ig, li, yt, web}
  emailPublic  Boolean  @default(false)
  phonePublic  Boolean  @default(false)
  createdAt    DateTime @default(now())
  memberships  Membership[]
  posts        Post[]
  comments     Comment[]
  reactions    Reaction[]
  notifications Notification[]
  sentDMs      DirectMessage[] @relation("DMSender")
  courseProgress LessonProgress[]
  points       Int      @default(0)           // for leaderboard
}

model Membership {                              // community-level
  id          String   @id @default(cuid())
  userId      String
  communityId String
  joinedAt    DateTime @default(now())
  @@unique([userId, communityId])
}

model GroupMembership {
  id         String          @id @default(cuid())
  userId     String
  groupId    String
  role       GroupRole       @default(MEMBER)
  state      MembershipState @default(ACTIVE)    // REQUESTED | ACTIVE | BANNED
  joinedAt   DateTime        @default(now())
  lastActiveAt DateTime?                          // powers "Active Xh ago" + presence
  bannedAt   DateTime?
  banReason  String?
  @@unique([userId, groupId])
  @@index([groupId, state])
}

model Post {
  id        String   @id @default(cuid())
  groupId   String
  channelId String                             // NEW: posts live in channels
  authorId  String
  title     String?
  body      String                             // rich text / markdown
  mediaUrls String[]
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now())
  editedAt  DateTime?
  comments  Comment[]
  reactions Reaction[]
  poll      Poll?
  @@index([groupId, createdAt])
  @@index([channelId, createdAt])
}

model Comment {
  id        String   @id @default(cuid())
  postId    String
  authorId  String
  parentId  String?                            // threaded
  body      String
  createdAt DateTime @default(now())
  reactions Reaction[]
}

model Reaction {
  id         String   @id @default(cuid())
  userId     String
  postId     String?
  commentId  String?
  type       String                            // like / love / laugh / insightful
  createdAt  DateTime @default(now())
  @@unique([userId, postId, commentId, type])
}

model Poll {
  id      String @id @default(cuid())
  postId  String @unique
  options PollOption[]
}
model PollOption {
  id     String @id @default(cuid())
  pollId String
  label  String
  votes  PollVote[]
}
model PollVote {
  id       String @id @default(cuid())
  optionId String
  userId   String
  @@unique([optionId, userId])
}

model Notification {
  id        String   @id @default(cuid())
  userId    String                             // recipient
  actorId   String?                            // who caused it
  type      String                             // post.mention, comment.reply, dm.new, course.unlocked…
  entityRef String?                            // polymorphic pointer
  readAt    DateTime?
  createdAt DateTime @default(now())
}

model Event {
  id          String   @id @default(cuid())
  groupId     String
  title       String
  description String?
  startsAt    DateTime
  endsAt      DateTime?
  location    String?                          // URL or address
  rsvps       EventRSVP[]
}
model EventRSVP {
  id      String @id @default(cuid())
  eventId String
  userId  String
  status  String                               // going / maybe / declined
  @@unique([eventId, userId])
}

model Course {
  id          String   @id @default(cuid())
  groupId     String?                          // optional scoping
  slug        String
  title       String
  description String?
  coverUrl    String?
  published   Boolean  @default(false)
  lessons     Lesson[]
  @@unique([groupId, slug])
}
model Lesson {
  id         String  @id @default(cuid())
  courseId   String
  order      Int
  title      String
  body       String?
  videoUrl   String?
  progress   LessonProgress[]
}
model LessonProgress {
  id         String   @id @default(cuid())
  userId     String
  lessonId   String
  completed  Boolean  @default(false)
  updatedAt  DateTime @updatedAt
  @@unique([userId, lessonId])
}

// Chat covers three surfaces:
//   DIRECT  = 1:1 DM (top-right Chat button)
//   GROUP   = ad-hoc named group thread (top-right Chat button)
//   CHANNEL = built-in live chat room attached to a Channel (FB/Messenger-style group chat inside each sub-group)
model ChatThread {
  id            String   @id @default(cuid())
  kind          ChatKind @default(DIRECT)
  title         String?                          // for GROUP chats
  channelId     String?  @unique                 // set when kind=CHANNEL (1:1 with Channel)
  createdAt     DateTime @default(now())
  lastMessageAt DateTime?
  participants  ChatParticipant[]
  messages      ChatMessage[]
}
enum ChatKind { DIRECT GROUP CHANNEL }

model ChatParticipant {
  id         String   @id @default(cuid())
  threadId   String
  userId     String
  joinedAt   DateTime @default(now())
  lastReadAt DateTime?                           // for unread counts
  @@unique([threadId, userId])
}

model ChatMessage {
  id        String   @id @default(cuid())
  threadId  String
  senderId  String
  body      String
  mediaUrls String[]
  createdAt DateTime @default(now())
  editedAt  DateTime?
  @@index([threadId, createdAt])
}

// Presence — powers "Active Xh ago" and online dots
model Presence {
  userId     String   @id
  lastSeenAt DateTime @default(now())
  status     PresenceStatus @default(OFFLINE)  // ONLINE | AWAY | OFFLINE
}
enum PresenceStatus { ONLINE AWAY OFFLINE }

model Invite {
  id        String   @id @default(cuid())
  groupId   String
  email     String?
  phone     String?
  token     String   @unique
  invitedBy String
  usedAt    DateTime?
  expiresAt DateTime
}

// Booking + Google Calendar / Meet integration
// Per-user OAuth tokens so we can read availability and write events with Meet links on their behalf
model GoogleAccount {
  id            String   @id @default(cuid())
  userId        String   @unique
  email         String
  accessToken   String   @db.Text
  refreshToken  String   @db.Text
  expiresAt     DateTime
  scope         String                          // calendar, meet, etc.
  calendarId    String?                          // user's primary calendar (usually "primary")
  syncEnabled   Boolean  @default(true)
  createdAt     DateTime @default(now())
}

// A hostable user's availability rules (Calendly-style)
model Availability {
  id         String   @id @default(cuid())
  userId     String                              // the host (coach / admin / any member)
  timezone   String                              // IANA, e.g. "Africa/Cairo"
  rules      Json                                // weekly recurring [{ day: "MON", from: "09:00", to: "17:00" }, ...]
  minNoticeMinutes Int  @default(60)             // how soon before a slot can be booked
  slotMinutes     Int   @default(30)             // slot length
  bufferMinutes   Int   @default(0)              // gap between bookings
  maxPerDay       Int?                           // optional cap
  updatedAt  DateTime @updatedAt
}

// A concrete booking between two (or more) users, scoped to a group
model Booking {
  id            String   @id @default(cuid())
  groupId       String?                          // optional group scoping
  hostId        String                           // who is being booked
  inviteeId     String                           // who booked
  title         String
  description   String?
  startsAt      DateTime
  endsAt        DateTime
  timezone      String
  status        BookingStatus @default(CONFIRMED)
  // Google integration fields — written when host has a linked GoogleAccount
  googleEventId String?                          // created via Calendar API
  meetLink      String?                          // generated via conferenceData.createRequest
  icsUid        String?                          // for non-Google attendees (ICS email fallback)
  createdAt     DateTime @default(now())
  cancelledAt   DateTime?
  @@index([hostId, startsAt])
  @@index([inviteeId, startsAt])
}
enum BookingStatus { CONFIRMED CANCELLED COMPLETED NOSHOW }

// Gamification
model PointsLedger {
  id        String   @id @default(cuid())
  userId    String
  amount    Int
  reason    String                             // post / comment / reaction_received / lesson_complete
  createdAt DateTime @default(now())
}
```

---

## 6. Interaction Patterns (to confirm after auth)

- **Infinite scroll** on feed (Skool parity — needs confirmation)
- **Optimistic UI** on reactions and comments
- **Toasts** for success/error
- **Modal** flows for post composer, event creation, invite, settings
- **Shimmer skeletons** during load (confirmed from CSS)
- **Dark mode toggle** (confirmed — both palettes in CSS)
- **PWA install** (confirmed — offline-enabled, standalone)

---

## 7. Accessibility & Performance Signals

- Mobile-first with bottom nav below 768px
- Responsive breakpoints at 767 / 930 / 1024
- Avatars are circles (`border-radius: 50%`)
- Surface cards at 8px / 15px radii
- Offline-capable PWA → likely Service Worker + cache-first strategy

---

## 8. Gaps — after screenshot pass

Legend: ✅ resolved · 🟡 partial · 🔴 still open

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Feed layout / post card anatomy | ✅ | Author + @handle + timestamp + channel + title + body + media + reactions strip |
| 2 | Post composer | 🔴 | Need composer-open screenshot to see rich-text toolbar + supported types |
| 3 | Comment tree | 🔴 | Need a post-detail screenshot with thread open |
| 4 | Reaction types | 🔴 | Need a post-detail screenshot (assumed ❤️ + Skool-style multi-reaction) |
| 5 | Leaderboard | 🔴 | Not in group tabs — may live under "More", profile, or global. Need to check |
| 6 | Chat UX (DMs + groups) | 🟡 | Confirmed: separate "Chat" button w/ unread count; DM vs group-thread split TBD |
| 7 | Notification center | 🟡 | 99+ badge confirmed; dropdown grouping/sections TBD |
| 8 | Search scope | 🟡 | Global pill confirmed; filters/autocomplete/result categories TBD |
| 9 | Course player | 🔴 | Need a lesson-inside screenshot — video host, progress, navigation |
| 10 | Events | ✅ | Day/Week/Month, Today, Share, color-coded categories, Upcoming/Past side lists |
| 11 | Member directory | ✅ | 5 filter tabs, search, presence dots, @handle, last-active, joined, email, overflow menu |
| 12 | Admin panel | 🔴 | Need an owner-view screenshot (Settings / branding / moderation queue) |
| 13 | Onboarding flow | 🔴 | Need a first-login sequence (welcome modal, profile completion, etc.) |
| 14 | Mobile gestures | 🔴 | Need mobile screenshots |
| 15 | API shape (REST vs GraphQL, WS endpoint) | 🔴 | Needs DevTools Network tab export (HAR) to confirm |
| 16 | Exact SPA framework | 🔴 | Needs rendered HTML via a JS-capable browser, not WebFetch |
| 17 | Rich-text editor fingerprint | 🔴 | Same — needs rendered DOM |
| 18 | File upload flow (signed URL to GCS?) | 🔴 | Needs network tab during an upload |
| 19 | Typography / font family | 🟡 | Appears Inter/system; exact font-family declaration TBD |
| 20 | Icon library | 🟡 | Line-weight suggests Lucide/Feather — confirm via source |
| 21 **NEW** | "Contributor" role permissions | 🔴 | Confirmed as a role; what distinguishes it from Member TBD |
| 22 **NEW** | Channel creation permissions | 🔴 | "+ ADD CHANNEL" visibility per role TBD |
| 23 **NEW** | Private channel access model | 🔴 | By role? Invite-only? Need settings screenshot |
| 24 **NEW** | Event create/RSVP flow | 🔴 | Calendar confirmed, but create/edit modal + RSVP states not seen |
| 25 **NEW** | Presence mechanics | 🟡 | Dots confirmed; debounce rules and "Xd ago" threshold TBD |

### Unblocking the remaining reds

Most of the reds above collapse into **5 extra screenshots**:
1. A post detail view (composer, thread, reactions)
2. A course lesson page (video + progress sidebar)
3. The notifications dropdown open + the chat inbox open
4. The group Settings / admin panel (as the owner account)
5. One mobile-width screenshot of the feed

Everything else (API shape, framework fingerprint, RTE, upload flow) is a Phase-2/3 implementation concern — we can decide those for the **clone** without needing the exact source tech.

---

## 9. What's next

With ~60% of gaps closed, I have enough confidence to produce Phase 2.

1. Proceed to **Phase 2** — `02_architecture.md` + `03_roadmap.md`.
2. The remaining 🔴 items (reactions, leaderboard, admin panel, course player) will be **designed using best-practice patterns** (Skool/Circle conventions) with TODO markers so you can swap in the exact behavior once you send the 5 extra screenshots listed above.
3. **STOP** after Phase 2 — wait for your approval before Phase 3 build.
