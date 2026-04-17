# Community Clone

A Skool / ClientClub-style community platform clone — analyzed and rebuilt from the ground up.
Target scope: **13 milestones** to full parity (see [`analysis/03_roadmap.md`](analysis/03_roadmap.md)).

**Current state:** M2 shipped (communities, groups, memberships, 4-tier roles, per-group theming, group creation wizard, members directory). Awaiting approval to start M3 (channels + built-in chat threads).

---

## Setup

Requires **Node 20+** and **npm**.

```bash
# 1. Install deps (also runs `prisma generate`)
npm install

# 2. Create your env file
cp .env.example .env.local
# then optionally fill in AUTH_GOOGLE_* and AUTH_RESEND_KEY

# 3. Create the DB and run migrations
npm run db:push          # or: npm run db:migrate (creates a migration file)

# 4. Seed three dev users
npm run db:seed

# 5. Start the dev server
npm run dev              # → http://localhost:3000
```

### Signing in during dev

- **Email magic link** — enter `alex@example.com` (or any seeded email) on `/login`. Because `AUTH_RESEND_KEY` is empty in the default `.env.local`, the magic-link URL is **printed to the server console**. Copy it into your browser to sign in.
- **Google OAuth** — set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (console → APIs → OAuth consent). The "Continue with Google" button only shows when these are set.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (also runs `prisma generate`) |
| `npm run start` | Serve the production build |
| `npm run db:push` | Apply the Prisma schema to the DB without a migration file |
| `npm run db:migrate` | Create + apply a named migration (use in PRs) |
| `npm run db:reset` | Drop and recreate the DB (dev only) |
| `npm run db:seed` | Reseed the 3 dev users |
| `npm run db:studio` | Open Prisma Studio on `localhost:5555` |
| `npm run lint` | Next.js ESLint |
| `npm run typecheck` | `tsc --noEmit` |

---

## What works today (M1 + M2)

- Sign up / sign in (magic link + Google)
- Edit your profile — display name, bio, language, email-visibility toggle
- View `/profile/@handle` for yourself or any seeded user
- Light / dark toggle
- English / Arabic toggle — flips the whole UI to RTL, translates all strings
- **Create a group** with a chosen visibility and primary color
- **Group switcher** in the top nav listing all your groups + Discover + Create
- **Group shell** with 5 tabs (Discussion, Learning, Events, Members, About), right-rail stats, per-group color theming
- **Members page** with 5 filter tabs, role badges, presence dots
- **Role system**: promote/demote (4 tiers), approve/reject pending, ban/unban, remove — with guardrails (can't demote last owner, only owners touch OWNER)
- **Group settings** for admins — rename, change visibility, change primary color

## What's next

See [`analysis/03_roadmap.md`](analysis/03_roadmap.md) for the 13-milestone plan. Next up is **M3 — Channels + auto-provisioned chat threads**, which adds Slack-style channels inside each group with per-channel built-in group chat rooms.

## Stack

`Next.js 14 App Router` · `TypeScript (strict)` · `Tailwind + shadcn/ui + Radix` · `Prisma + SQLite (→ Postgres at M4)` · `NextAuth v5 (beta)` · `next-intl` · `next-themes` · `Zod` · `Resend`

Planned for later milestones: `tRPC`, `Pusher`, `TipTap`, `Vercel Blob`, `googleapis` (Calendar + Meet), `ics`, `Twilio`.

## Project layout

See [`analysis/02_architecture.md`](analysis/02_architecture.md) §2 for the full folder-structure plan.

## Legal

Placeholder branding only. No logos, trademarks, or copyrighted content from the source platform are reproduced.
