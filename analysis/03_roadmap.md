# Phase 3 — Roadmap (13 milestones)

> Gated build. Each milestone ships a **working app** you can click through, with seed data, a `CHANGELOG.md` entry, and a git commit. I stop at the end of each one and ask for approval to start the next.

---

## Ground rules (apply to every milestone)

1. **Runs end-to-end** — `pnpm dev` boots, features are clickable, seed data loaded.
2. **Typed top-to-bottom** — TS strict; tRPC inputs Zod-validated.
3. **Mobile-first** — every view laid out for ≤375px width, scales up.
4. **a11y** — semantic HTML, keyboard nav, labeled controls, alt text.
5. **Dark mode** works.
6. **Arabic + RTL** works (test bilingual string in seed data).
7. **Tests for the critical path** of the milestone (happy + one failure case).
8. **CHANGELOG.md + commit** at the end.
9. **I ask before starting M(X+1).**

---

## M1 — Foundation: scaffold + auth + profile

**Goal:** a deployable Next.js app where a user can sign up, log in, edit their profile, and toggle light/dark + en/ar.

Scope:
- `create-next-app` with TS + Tailwind + App Router
- shadcn/ui init; base theme tokens wired (purple `--brand-*` from audit §2)
- Prisma + Neon connection; `User`, `Presence`, `Membership` models migrated
- NextAuth v5: email magic link (Resend) + Google OAuth
- `@handle` auto-generator (`slugify(name) + 6-char suffix`) on signup
- `(auth)/login`, `(auth)/verify`, `(app)/home` (placeholder feed), `(app)/settings/profile`, `(app)/profile/[handle]`
- Global shell: top nav with Home / Search (stub) / Theme toggle / App-switcher (stub) / Bell (stub) / Avatar / Chat (stub)
- `next-intl` with `en` + `ar`; `<html lang dir>` toggle working
- `.env.example`, seed script creating 3 users
- Deploy preview on Vercel

**Done when:** signup → verify → profile edit → light/dark & en/ar swap all work on both localhost and preview URL.

---

## M2 — Communities + Groups + Memberships + Roles

**Goal:** a user can create a group, invite themselves into others, and see their groups in a switcher.

Scope:
- `Community`, `Group`, `GroupMembership` models migrated
- Group creation flow (wizard: name, slug, primary color, logo upload stub, description)
- Group switcher in top-left (dropdown, matches screenshot 1 chrome)
- Group shell layout with **tabs stubbed** (Discussion, Learning, Events, Members, About) + left sidebar stub + right rail with stats widget (static numbers for now)
- Per-group primary-color theming via CSS variables (group owner picks → sidebar/header recolor)
- Role system (`OWNER/ADMIN/CONTRIBUTOR/MEMBER`) + `MembershipState` (`REQUESTED/ACTIVE/BANNED`)
- Seed: 2 communities, 3 groups, 10 users spread across roles

**Done when:** I can create a group, theme it purple, invite another seeded user, see myself as OWNER and them as MEMBER.

---

## M3 — Channels inside groups (+ auto-provisioned chat thread)

**Goal:** Slack-style channel sidebar with CRUD; every channel is born with its own built-in group-chat thread (FB/Messenger-style) — UI comes in M8, but the thread row is created now so messages can attach later.

Scope:
- `Channel`, `ChannelAccess`, `ChatThread` (kind=CHANNEL), `ChatParticipant` models migrated
- Left sidebar lists channels with icon (public `#`, private `🔒`, optional emoji prefix)
- `+ ADD CHANNEL` modal (admin+); channel types: PUBLIC / PRIVATE / ANNOUNCEMENT
- Channel route `/groups/:slug/channels/:channelSlug` rendering two tabs: **Posts** (placeholder for M4) and **Chat** (placeholder for M8)
- **On channel create:** auto-create a `ChatThread { kind: CHANNEL, channelId }` and backfill `ChatParticipant` rows for all current channel members. New joins/leaves keep participants in sync via a service hook.
- Permissions: PRIVATE channels + their chat threads hidden from non-granted users
- Seed: 8 generic channels with auto-created chat threads

**Done when:** as admin I can create/delete/rename a channel; as member I only see channels I have access to; each channel shows both Posts and Chat tabs (empty placeholders for now).

---

## M4 — Posts + Feed + TipTap composer + Media upload

**Goal:** the Discussion tab becomes real. Users can write posts with rich text + images and see a live-updating feed.

Scope:
- `Post` model migrated with `channelId`
- TipTap composer with: bold/italic/link/mention stub/image upload + RTL toggle per block
- Vercel Blob integration for image upload (direct-to-blob signed URL)
- Feed: infinite scroll (cursor-based, 20/page), SSR first page + client fetch subsequent
- PostCard matches screenshot anatomy: avatar · name · `@handle` · `Xd ago · in #channel` · title · body · media grid
- "Group feed" (all accessible channels) + "Channel feed" (single channel)
- Pin a post (admin+)
- Pusher wiring: `post.created` appears in other tabs without refresh (optimistic on author, pushed to others)

**Done when:** two logged-in users see each other's posts in real time with images and Arabic text rendering correctly.

---

## M5 — Comments + Reactions + Polls

**Goal:** posts become conversational.

Scope:
- `Comment`, `Reaction`, `Poll`, `PollOption`, `PollVote` models
- Nested comments (max 2 levels — TODO(parity): confirm from screenshot)
- Reaction bar under posts and comments; multi-reaction set (`❤️ 👍 🎉 🤔 👏` — TODO(parity))
- Poll block in composer (add to TipTap as a custom node); vote + view results
- Optimistic UI on reactions (click → instant count bump → reconcile with server)
- Pusher: comments and reactions broadcast to `post-{id}` channel

**Done when:** a post reaches ≥3 comments in a thread, a poll gets ≥3 votes, reactions update live across browsers.

---

## M6 — Members directory + Invite flow + Presence

**Goal:** Members tab matches the screenshot; people can be invited.

Scope:
- Members page with **5 filter tabs** (`Active / Admins / Contributors / Requested / Banned`), member search, rows matching the screenshot (avatar + presence dot + name + handle + last-active + joined + email + ⋮ menu)
- Invite flow: email invite via Resend, SMS via Twilio (stubbed behind feature flag if Twilio creds absent), unique `Invite.token`, accept page
- Presence: Pusher `presence-group-{groupId}` channel driving green/orange dots + "Active Xh ago" label (debounced every 60s)
- Admin actions from `⋮` menu: change role, ban, unban, remove
- Pending-request badge on the Requested tab

**Done when:** I invite a new email, they click the link, land in the group as MEMBER, and show as online in the directory.

---

## M7 — Notifications + Mentions + Real-time bell

**Goal:** the 99+ bell is real.

Scope:
- `Notification` model + polymorphic `entityRef`
- Trigger points: `@mention`, comment on your post, reply to your comment, reaction on your post, membership approved, invite accepted
- TipTap mention extension with autocomplete over group members
- Bell popover: grouped list ("New", "Earlier"), unread badge, mark-all-read
- Pusher: `notification.created` → badge increments + optional toast
- Per-user preferences page (email vs in-app, per event type)

**Done when:** an `@mention` in a post triggers a live notification and an email, and the bell badge updates without refresh.

---

## M8 — Chat: DMs + ad-hoc groups + **built-in channel chat rooms**

**Goal:** both chat surfaces work — the top-right personal inbox AND the Chat tab inside every channel (FB/Messenger-style).

Scope:
- `ChatMessage` model + message rendering (migrations for thread/participants were done in M3)
- **Personal Chat** (top-right button):
  - Inbox `/chat` with thread list (last message preview, unread count) — filters `DIRECT` + `GROUP` kinds only
  - Thread view `/chat/:id` with messages, composer, media attach
  - Start DM from a member's profile / overflow menu
  - Owner/admin can create a named group thread and add participants
- **Channel Chat** (built-in, per channel):
  - `/groups/:slug/channels/:channelSlug` → **Chat tab** reuses the same thread UI, auto-scoped to the channel's `ChatThread`
  - Members auto-joined; leaving the channel leaves the thread
  - Unread count per channel surfaces on the left sidebar (red dot / number)
  - Pinned announcements (Admins can pin a chat message to the top of the channel chat)
- Typing indicators + read receipts via Pusher for all three kinds (DIRECT / GROUP / CHANNEL)
- Unread count on the header Chat button only counts DIRECT + GROUP (channel chat lives in its own badge)

**Done when:** (1) two users hold a live DM with typing indicator from the header inbox; (2) inside a channel, multiple members hold a live group chat that feels like a Messenger group, with unread badges on the sidebar.

---

## M9 — Courses + Lessons + Progress

**Goal:** Learning tab shows the course grid, lessons are playable.

Scope:
- `Course`, `Lesson`, `LessonProgress` models
- Learning tab: grid matching screenshot 2 (cover illustration / title / price tag / OPEN) + `+ Add Course` tile for admins
- Course detail: lesson list (sidebar) + player pane (HTML5 video from signed URL)
- Progress: "Complete & continue" button, per-lesson checkmark, course-level % progress
- Pricing: `Free` badge now; paid course placeholder with a "Coming soon" CTA (Stripe wiring deferred to post-M12)
- Admin: create/edit course + lessons (TipTap body + video upload)

**Done when:** I can browse a course, watch a lesson, mark it complete, and see my progress persist across reloads.

---

## M10 — Events + Calendar + RSVP

**Goal:** Events tab matches screenshot 3.

Scope:
- `Event`, `EventRSVP` models
- Calendar view with Day/Week/Month toggle + Today button + color-coded events (category field on Event)
- Upcoming / Past side panel
- Event create modal (title, description, startsAt/endsAt with timezone, color, location URL, recurrence — or at least weekly for M10; full rrule later)
- RSVP buttons (Going / Maybe / Declined)
- "+ Share" action copies event link
- Email reminder 24h + 1h before (Resend + Vercel Cron)

**Done when:** I can create a recurring weekly event, RSVP from another account, and get a reminder email scheduled.

---

## M11 — Booking + Google Calendar + Google Meet (NEW)

**Goal:** any member can expose availability, others book a slot from inside the community, and both sides get a Google Calendar event with a Google Meet link automatically.

Scope:
- `GoogleAccount`, `Availability`, `Booking` models migrated
- **Google OAuth flow** — "Connect Google" button in Settings; requests `calendar.events` + `meetings.space.created` scopes; stores encrypted refresh token
- `googleapis` SDK service layer: `createEvent()`, `cancelEvent()`, `freeBusy()`
- **Availability editor** (`/settings/availability`): weekly recurring rules, timezone, slot length, buffer, min-notice, max-per-day
- **Booking page** on a user's profile `/profile/:handle/book`:
  - Computed slots = Availability rules ∩ (NOT busy via Google freeBusy) − existing Bookings
  - Invitee picks a slot → fills title/description → confirm
  - Server creates the Google Event with `conferenceData.createRequest` → **Meet link auto-generated** → stored as `meetLink` on the Booking
  - Email confirmation to both sides via Resend (with "Join Google Meet" button and "Add to calendar" .ics attachment)
- **Non-Google invitee fallback:** if invitee has no GoogleAccount, they still get the ICS + Meet link (since host's calendar generates it)
- **Community entry points to booking:**
  - "Book a session" CTA on member profile
  - "Book" button on group member rows (admin config: who is bookable — admins only / contributors+ / everyone)
  - New Events calendar overlay shows your upcoming bookings alongside group events
- Cancel flow: removes event on both sides; sends cancellation email
- Pusher: booking created/cancelled → bell notification + toast to host and invitee

**Done when:** User A connects Google → User B opens A's book page → picks a slot → both get a Google Calendar event with a working Meet link, and cancelling from either side removes it from both calendars.

---

## M12 — Leaderboard + Points + Admin panel

**Goal:** gamification layer + the owner's command center.

Scope:
- `PointsLedger` — append-only; earn rules: +1 post, +1 comment, +1 reaction received, +5 lesson completed (TODO(parity))
- `/groups/:slug/leaderboard` with windowed views: 7-day, 30-day, all-time
- Admin panel routes:
  - `/admin` — overview: members/posts/admins + recent activity
  - `/admin/members` — bulk actions
  - `/admin/requests` — approve/reject with notes
  - `/admin/channels` — drag-to-reorder, permissions
  - `/admin/branding` — primary color picker, logo/cover/favicon upload (live preview)
  - `/admin/settings` — name, slug, description, privacy (public/private/hidden), active/inactive, soft-delete
- Soft-delete + restore (30-day recovery window)

**Done when:** the leaderboard reflects seed activity, and an owner can rebrand the group live (color + logo) and it repaints across all tabs.

---

## M13 — Polish, search, SEO, PWA, deploy

**Goal:** it feels shipped.

Scope:
- Global search `/search?q=` across posts + members + courses (Postgres FTS; swap to Typesense later if volume grows)
- Search results page with type tabs + autocomplete in the header pill
- PWA: manifest + icons + service worker (cache static shell, runtime-cache feed GETs)
- Lighthouse pass: ≥ 90 on Performance / Accessibility / Best Practices / SEO on feed, profile, landing
- Sentry + PostHog wired end-to-end with release tags
- Production deploy to Vercel with Neon prod branch; seed script converted to idempotent prod-safe seeder
- `README.md` finalized: setup, env vars, migrate, seed, dev, deploy, architecture decision summary
- `CHANGELOG.md` gets a 1.0.0 entry

**Done when:** the production URL boots in < 2s, the PWA installs on mobile, search returns results across all three indexes, and all critical-path E2E tests pass green.

---

## Post-1.0 (explicit out-of-scope list)

For transparency, these are what you'd ask for next, not what we're building now:
- Paid memberships (Stripe Subscriptions + gating)
- Affiliate / commission tracking
- Native mobile (React Native / Expo)
- Conversation AI + multi-channel unified inbox
- Custom-domain self-serve UI
- Advanced moderation (auto-mod rules, AI toxicity detection)
- Webhooks + Zapier-style integrations
- White-label / multi-tenant hosting

---

## Effort shape (relative, not time-bound)

Rough sizing just so we know where the mass is:

```
M1  ██░░░░░░░░  scaffold + auth
M2  ███░░░░░░░  groups + roles
M3  ███░░░░░░░  channels (+ auto-provisioned chat threads)
M4  █████░░░░░  posts + composer + feed (heavy)
M5  ████░░░░░░  comments + reactions + polls
M6  ████░░░░░░  members + invite + presence
M7  ████░░░░░░  notifications
M8  ██████░░░░  chat: DMs + groups + built-in channel chat (heavy)
M9  █████░░░░░  courses (heavy)
M10 ████░░░░░░  events
M11 █████░░░░░  booking + google calendar + meet (heavy, new)
M12 █████░░░░░  leaderboard + admin (heavy)
M13 ████░░░░░░  polish + deploy
```

The five "heavy" ones (M4, M8, M9, M11, M12) are where the product-y depth lives. If you want to move faster, tell me which to thin.
