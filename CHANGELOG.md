# Changelog

## [Deploy] — Production deployment + GitHub CI — 2026-04-17

First public deployment. The app is live at **https://community-clone.vercel.app** and every `git push` to `main` now triggers an automatic Vercel redeploy.

### Infrastructure shipped
- **PostgreSQL (Neon)** — migrated Prisma datasource from SQLite to Neon serverless Postgres (`POSTGRES_PRISMA_URL` + `DATABASE_URL_UNPOOLED`). Schema pushed, seed data loaded (6 users, 3 groups, 8 channels, 13 posts).
- **Vercel project** — created under `ahmedgamal17998-blips-projects`, SSO protection disabled, all env vars set (`DATABASE_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `DEMO_MODE=1`).
- **GitHub repo** — `github.com/ahmedgamal17998-blip/community-clone` (public, 92 files, initial commit).
- **Vercel ↔ GitHub integration** — Vercel GitHub App installed; `main` branch connected; future pushes auto-deploy to production.

### Fixes applied during deployment
- **`__Secure-authjs.session-token` cookie name** — dev one-click login was setting `authjs.session-token` (HTTP name) even on HTTPS. On Vercel (HTTPS), NextAuth looks for `__Secure-authjs.session-token`. Fixed by deriving cookie name from `url.protocol`.
- **Demo login UI** — when `DEMO_MODE=1`, the `/login` page now renders 6 one-click user buttons (Alex, Mona, Samir, Yara, Chris, Omar) instead of the email form, so testers never see "check your email".
- **`AUTH_SECRET` hardened** — replaced the placeholder `"replace-me-with-openssl-rand-base64-32"` with a proper 32-byte base64 secret.

### How to test
Open **https://community-clone.vercel.app** → click any name → you're logged in.

---

## [M4a] — Posts + feed + composer — 2026-04-17

Fourth milestone, first slice. Channels finally have **posts**: plain-text composer, cursor-paginated feed (pinned first, then newest), author/channel/time header with pin + edit + delete moderation controls, media URL attachments rendered as a responsive image grid, and infinite scroll on both the group Discussion tab and the per-channel Posts tab. TipTap rich-text, Vercel Blob uploads, Pusher realtime, and the Postgres migration are explicitly deferred to M4b because they need external service credentials.

### Added
- **Prisma schema**: `Post` (title, body, `mediaUrls` JSON-encoded string for SQLite forward-compat, `pinned`, `editedAt`, `@@index([channelId, pinned, createdAt])`). `User` and `Channel` both gain a `posts Post[]` relation.
- **Post service** (`src/server/posts.ts`):
  - `listChannelPosts` — single-channel feed, pinned posts on the first page only, non-pinned items cursor-paginated via `createdAt|id` tuple.
  - `listGroupFeed` — composes `listVisibleChannels` with the same cursor shape, so PRIVATE channels only bubble into the feed for users who have a grant.
  - `decodeMedia` / `encodeMedia` — JSON-array helpers; when we move to Postgres (M4b) `mediaUrls` becomes a native `String[]` and these collapse to no-ops.
  - `postInclude` shared shape + `Prisma.PostGetPayload<{ include: typeof postInclude }>` ensures every caller renders the same `PostCard` data without redeclaring the include.
- **Server actions** (`src/server/post-actions.ts`): `createPostAction`, `editPostAction`, `deletePostAction`, `togglePinAction`. `canWriteToChannel` gate enforces ANNOUNCEMENT = admin-only, PRIVATE = explicit grant or admin, PUBLIC = any ACTIVE member. All actions call `revalidatePath` on the channel + group routes.
- **`Composer`** (`src/components/post/Composer.tsx`): client component, collapsed compact state until focused, `useFormState` + `useFormStatus` (React 18), optional title, textarea body, "Add media" toggle revealing a one-URL-per-line textarea.
- **`PostCard`** (server component): author avatar with initials fallback, `@handle`, localized relative time via `Intl.RelativeTimeFormat`, optional channel crumb, `pinned` badge, `edited` badge, responsive media grid (1–4 images before "+N more"), post body with `whitespace-pre-wrap`, and the admin-or-author `PostActionsMenu`.
- **`PostActionsMenu`** (client DropdownMenu): pin/unpin (admin+), edit (author), delete (author or admin). Uses separate `<form action={serverAction}>` per action with hidden inputs — no inline async client handlers (which can't invoke server actions correctly).
- **`FeedClient`** (infinite-scroll loader): IntersectionObserver on a sentinel row, fetches `/api/feed?groupId=…|channelId=…&cursor=…`, appends pages, inlines post rendering to stay within the client bundle.
- **`/api/feed`**: GET handler. Validates viewer is an ACTIVE member of the target group and, for channel feeds, re-enforces the PRIVATE access grant so the URL can't be tampered with to escape visibility rules.
- **Discussion tab** (`groups/[slug]/page.tsx`) now renders the real group feed with pinned-first ordering and the infinite-scroll loader. Non-members see `posts.nonMember` placeholder copy instead of a raw "join to read" wall.
- **Channel Posts tab** (`groups/[slug]/channels/[channelSlug]/page.tsx`) renders per-channel feed with composer gated to `canPost` (ANNOUNCEMENT channels hide composer for non-admins).
- **`formatRelative`** (`src/lib/relative-time.ts`): `Intl.RelativeTimeFormat` wrapper — picks the largest unit (`year`/`month`/`day`/`hour`/`minute`/`second`) and formats localized strings (works natively for Arabic: "منذ 3 أيام").
- **`initialsFrom`** (`src/lib/initials.ts`): extracted out of the `"use client"` `avatar.tsx` so server components (PostCard, profile page, members page) can import a plain utility — "use client" modules expose exports as client references and plain functions aren't callable server-side.
- **Seed**: 13 posts across the 8 channels in the three groups — English/Arabic bodies, 2 pinned posts, varied ages so cursor pagination is exercisable. Idempotent via a `findFirst` match on `(channelId, authorId, title, body-prefix)`.
- **i18n**: `posts.*` namespace added to en + ar (composer, card, menu, empty states, nonMember).

### Fixed
- **`groups.settings` key collision** — M2 introduced a nested `settings.*` object that shadowed the existing flat `"settings": "Settings"` menu label, which started throwing `IntlError: INSUFFICIENT_PATH` once M4 rendered the group shell for authenticated users. Renamed the nested object to `groups.settingsPage` (en + ar) and updated the two callers (`EditGroupForm`, settings page).
- **`initialsFrom` unreachable from server components** — moved to `src/lib/initials.ts` (see Added).

### Decisions
- **M4a vs M4b split** — shipped everything that works without new external services. TipTap rich text, Vercel Blob direct upload, Pusher realtime, and the Postgres migration all require credentials + infra setup, so they're staged as M4b behind a credentials request.
- **Pinned on first page only** — pinned posts are a "stop and read this" affordance; repeating them deeper in the scroll adds noise. Simpler than a single mixed query with synthetic ordering.
- **`mediaUrls` as JSON string, not a separate `PostMedia` table** — the M4b Postgres migration flips this to `String[]`; a join table would be premature since we don't need per-image metadata yet (caption, alt text, ordering are all derivable from array position).
- **Cursor = `createdAt|id`** — compound cursor is stable under identical `createdAt` (seed posts and bulk-imported posts can share timestamps down to the millisecond); `id: { lt }` on the tiebreak is deterministic because cuids are monotonic-ish.
- **`FeedClient` duplicates PostCard rendering** — rather than hydrate PostCard into client scope, the client loader inlines its own rendering. Keeps the server component free of `"use client"` bleedthrough and avoids shipping `getTranslations`/`next-intl/server` into the client bundle.

### Known limitations (resolved in later milestones)
- No rich text — body is plain text with `whitespace-pre-wrap`. TipTap lands in M4b.
- No image upload UI — `mediaUrls` takes pre-hosted URLs. Vercel Blob direct upload lands in M4b.
- No realtime — new posts appear on next request/revalidation. Pusher channel subscriptions land in M4b.
- No reactions, no comments — separate milestone (M5).
- SQLite still; moving to Postgres is M4b's tail.

## [M3] — Channels + auto-provisioned chat threads — 2026-04-17

Third milestone. Every group now has **channels** in a left rail (Discord/Slack-style), and every channel auto-provisions a built-in **chat thread** so the M8 chat UI has participants ready to render against. Channel kinds are `PUBLIC` / `PRIVATE` / `ANNOUNCEMENT`. Private channels use explicit per-user grants; public/announcement inherit from active group membership.

### Added
- **Prisma schema**: `Channel` (slug unique per group, `kind`, `emoji`, `position`, `archived`), `ChannelAccess` (per-user grants for PRIVATE), `ChatThread` (polymorphic `kind` = `DIRECT|GROUP|CHANNEL`, optional `channelId @unique`), `ChatParticipant` (lastReadAt ready for M8).
- **Channel service** (`src/server/channels.ts`):
  - `uniqueChannelSlug` — collision-safe slugger scoped to `[groupId, slug]`.
  - `eligibleUserIdsForChannel` — PUBLIC/ANNOUNCEMENT = all ACTIVE members; PRIVATE = grants ∩ ACTIVE members.
  - `ensureChannelThread` — creates (or returns) the CHANNEL thread and reconciles participants.
  - `syncChannelParticipants` / `syncAllChannelsForGroup` — idempotent diff-based add/remove, safe to call from any membership transition.
  - `listVisibleChannels` — honors PRIVATE grants for the current viewer.
- **Server actions** (`src/server/channel-actions.ts`): `createChannelAction`, `editChannelAction`, `deleteChannelAction`, `setChannelAccessAction` (GRANT/REVOKE).
- **Membership ↔ channel sync**: `joinGroupAction` (on ACTIVE), `leaveGroupAction`, `decidePendingAction` (on APPROVE), `moderateMemberAction` (BAN/UNBAN/REMOVE) all call `syncAllChannelsForGroup` so channel chat participants stay truthful.
- **Channel sidebar** in the group shell (left rail, ACTIVE-members-only). Admin+ gets a `+` button routing to `/groups/[slug]/channels/new`. Active channel highlighted via `usePathname`.
- **Add-channel page** `/groups/[slug]/channels/new` — admin+ only; form has name, emoji, description, and a 3-option kind picker with inline helper text.
- **Channel page** `/groups/[slug]/channels/[channelSlug]` with its own header (emoji/icon + name + description) and two tabs: **Posts** (empty-state, real feed in M4) and **Chat** (empty-state, live chat in M8). Visibility gate enforced in the channel layout (ACTIVE member; PRIVATE also needs grant unless admin+).
- **Seed expansion**: 8 channels across the 3 groups — `english-to-work` gets `#introductions`, `📣 announcements` (ANNOUNCEMENT), `🔒 admins-only` (PRIVATE, grants: alex + mona); `arabic-learners` gets `💬 عام` and `📚 قواعد` (Arabic slugs preserved); `deep-work-club` gets `⏱️ sprints`, `📎 resources`, `🎯 mentor-room` (PRIVATE, grants: samir + chris + omar). Every channel ships with its CHANNEL `ChatThread` and fully backfilled `ChatParticipant` rows.
- **i18n**: `channels.*` namespace added to en + ar (sidebar, kinds, tabs, create form, empty states).

### Decisions
- **Participants reconciled, not event-sourced** — rather than tracking join/leave deltas, we compute the eligible set and diff it against existing participants. Race-resilient and handles PRIVATE grant changes uniformly. `ensureChannelThread` delegates to `syncChannelParticipants` so seed reruns are idempotent.
- **`ChatThread.kind` polymorphic** — one schema across DIRECT / GROUP / CHANNEL means the M8 chat layer has one set of message queries to render against.
- **Arabic slugs allowed** — `prisma.channel.slug` is a free string with only `[groupId, slug]` uniqueness, so `عام` and `قواعد` survive to the URL rather than being slug-sanitized away.
- **Channel sidebar only for ACTIVE members** — non-members and BANNED users don't see the rail at all; this also collapses the layout from a 3-col grid to 2-col, so the Discussion/About pages keep the same width as M2.

### Known limitations (resolved in later milestones)
- Posts and Chat tabs are both empty-state shells — real feed in M4, real chat in M8.
- No edit/delete/archive UI for channels yet (the server actions exist; UI lands alongside the channel detail page polish in M4).
- Private-channel grant management UI is not yet built — `setChannelAccessAction` is wired but has no UI surface. Added in the members page in M4.

### Done-when checklist ✅
- [x] `npx tsc --noEmit` passes
- [x] `npm run build` compiles with 0 type errors
- [x] Seed creates 8 channels with auto-provisioned `ChatThread` + correct participants per kind
- [x] Admin+ sees `+ Add Channel`; regular members don't
- [x] Private channel visibility gate: non-grantees get 404, admins + grantees get through
- [x] Channel page renders Posts/Chat tabs and empty states
- [x] Arabic (`dir="rtl"`) works across all new surfaces

---

## [M2] — Communities + Groups + Memberships + Roles — 2026-04-17

Second milestone. The app now has the concept of **communities** (tenants) and **groups** (the unit most of the product lives at). A user can create a group through a wizard, theme it with a primary color, see all their groups in a top-left dropdown switcher, browse discoverable groups, and manage members with a 4-tier role system.

### Added
- **Prisma schema**: `Community`, `Group`, `GroupMembership` (with `Role` = `OWNER|ADMIN|CONTRIBUTOR|MEMBER`, `MembershipState` = `REQUESTED|ACTIVE|BANNED`, `GroupVisibility` = `PUBLIC|PRIVATE|HIDDEN`).
- **Server actions** (`src/server/groups.ts`):
  - `createGroupAction` — creates a Community + Group + OWNER membership atomically.
  - `joinGroupAction` — `PUBLIC` → immediately `ACTIVE`; `PRIVATE` → `REQUESTED` for admin approval; `HIDDEN` rejects.
  - `leaveGroupAction` — blocks owners from leaving (must transfer first).
  - `decidePendingAction` — admins approve/reject `REQUESTED` memberships.
  - `changeRoleAction` — admin can promote/demote up to their own tier; only owners can grant/revoke `OWNER`; can't demote the last owner.
  - `moderateMemberAction` — ban / unban / remove (never for `OWNER`).
  - `updateGroupAction` — admin-only edit of name, description, visibility, primary color.
- **Permissions** helper (`src/server/permissions.ts`) with `requireRole`, `isAtLeast`, `hasMinRole`, role ranking.
- **GroupSwitcher** dropdown in top-left of nav — lists your groups with tinted avatars + role badges, plus "Discover" and "Create a group" shortcuts.
- **Group shell layout** (`/groups/[slug]`) with 5 tabs stubbed: **Discussion · Learning · Events · Members · About**. Right rail widget shows member count, visibility, created date.
- **Per-group theming** via CSS variables — the group's `primaryHsl` triplet drives `--primary`, `--brand-500/600`, `--ring` inside the group shell only. Everything outside keeps the global palette.
- **Group creation wizard** `/groups/new`: name, description, visibility radio, 8-color preset palette. Creates a 1:1 Community+Group pair so ownership is clean.
- **Members page** `/groups/[slug]/members` with 5 filter tabs (Active / Admins / Contributors / Requested / Banned). Admin tabs hidden from non-admins. Each row has presence dot, role badge, state badge, and a kebab menu (for admins) with: change role, approve/reject, ban/unban, remove.
- **Group settings** `/groups/[slug]/settings` — admin-only edit form for name, description, visibility, primary color.
- **Groups directory** `/groups` — "Your groups" + "Discover" sections.
- **Home page** now shows your groups as tiles (was empty-feed only).
- **Seed expansion**: 2 Communities (`English Super Fast`, `Focus Labs`), 3 Groups (`english-to-work`, `arabic-learners`, `deep-work-club`), 10 users spanning all roles including one `REQUESTED` and one `BANNED` row for testing the Members tabs.
- **i18n**: `groups.*` namespace added with ~60 keys across en + ar, including ICU plural forms for `memberCount`.

### Decisions
- **Community ↔ Group 1:1 on creation** — the wizard creates a Community alongside each Group. This keeps ownership simple for M2 while leaving room for multi-group communities later without a migration.
- **State orthogonal to role** — `state` gates *whether* a user counts; `role` gates *what they can do*. This avoids the Role enum ballooning with states like `PENDING_ADMIN`.
- **HSL triplets everywhere** (`"H S% L%"`) — stored as strings, slotted directly into CSS vars with `hsl(var(--primary))`. No runtime parsing, no alpha collisions, repaints are instant.
- **`useFormState` not `useActionState`** — we're on React 18.3; `useActionState` is React 19.
- **Prisma reads `.env`, Next reads `.env.local`** — we ship both so the CLI and the app see `DATABASE_URL`. The seed script passes `--env-file=.env` to `tsx`.

### Known limitations (resolved in later milestones)
- The 5 group tabs (Discussion/Learning/Events/About) render empty-state placeholders — real content lands in M4 (posts), M9 (courses), M10 (events).
- Channels + built-in channel chat threads arrive in M3.
- No invite flow yet — users must be seeded or self-join. M6 adds invite links + email/SMS.
- No logo upload yet — groups fall back to tinted initials. Upload arrives with Vercel Blob in M4.
- Soft-delete + restore for groups arrives in M12.

### Done-when checklist ✅
- [x] `npm run build` compiles with 0 type errors
- [x] Seed creates 2 communities / 3 groups / 10 users / 18 memberships (spanning all roles + `REQUESTED` + `BANNED`)
- [x] Group switcher lists your groups + "Discover" + "Create"
- [x] Create-group wizard posts + redirects to the new group as OWNER
- [x] Group shell shows all 5 tabs + right rail
- [x] Per-group primary color repaints the group shell only (home/profile stay neutral)
- [x] Members page filters work; admin kebab menu appears only for admins
- [x] Role change / approve / reject / ban / unban / remove all enforce the permission guardrails
- [x] `dir="rtl"` Arabic UI works across every new page
- [x] Dev server boots on :3000 and renders

---

## [M1] — Foundation — 2026-04-17

First working milestone. The app boots, you can sign up via magic link or Google, edit your profile, view anyone's `/profile/@handle`, and the whole shell switches between light/dark and English/Arabic (with RTL) without a reload.

### Added
- **Next.js 14 App Router + TypeScript (strict) + Tailwind** scaffold
- **Prisma (SQLite)** with `User`, `Account`, `Session`, `VerificationToken`, `Presence` models
- **NextAuth v5 (beta)** with two providers:
  - **Resend** (email magic link). Falls back to logging the magic link to the server console when `AUTH_RESEND_KEY` is unset.
  - **Google OAuth** (auto-hidden from the Login UI if credentials aren't set).
- **`@handle` auto-generator** on first login: `slug(name) + 6-char suffix`, matching observed ClientClub pattern.
- **App shell** with top nav: Home · Search (stub) · Theme toggle · Locale toggle · Bell (stub) · Apps (stub) · Chat (stub) · Avatar menu.
- **Theme system** (`next-themes`): light / dark / system, with tokens from audit §2 wired into Tailwind.
- **i18n** (`next-intl`) with `en` and `ar` message bundles; locale cookie + `<html lang dir>` flip (no URL segments).
- **Auth pages**: `/login` (email + Google), `/verify`, with dev-mode hint.
- **App pages**: `/home` (welcome + empty-feed placeholder), `/settings/profile` (server-action save, Zod-validated), `/profile/@handle` (own vs other view).
- **Seed script**: 3 bilingual dev users (`alex@`, `mona@`, `jordan@example.com`).
- **Middleware**: session-cookie gate for `/home`, `/settings`, `/profile/*`, etc.
- **Branding**: placeholder-only. The observed purple palette is reused as the default brand color but no ClientClub / English Super Fast logos or copy are reproduced.

### Decisions
- **SQLite for M1** — zero-friction local dev. We'll switch to Postgres at M4 when we add array columns (`Post.mediaUrls`) and FTS.
- **Cookie-based locale toggle** (not path-based) — matches the target platform's behavior and keeps URLs clean.
- **Presence table created but passive in M1** — M6 will wire the heartbeat.

### Known limitations (resolved in later milestones)
- No communities, groups, channels, posts, comments, or chat yet (M2–M8).
- Bell, Apps, Chat buttons in the nav are stubbed — they render but do nothing.
- Google Meet / Calendar integration, courses, events, leaderboard: all later.

### Done-when checklist ✅
- [x] `npm run dev` boots on localhost:3000
- [x] Signup (magic-link) works end-to-end in dev (link printed to console)
- [x] Google OAuth works when credentials are set
- [x] Profile edit persists and re-renders without a hard reload
- [x] Light ↔ dark toggle works across all pages
- [x] English ↔ Arabic toggle flips `dir="rtl"` and translates copy
- [x] `/profile/@handle` resolves for seeded users
- [x] `npm run build` compiles with no type errors
