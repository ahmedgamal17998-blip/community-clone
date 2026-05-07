/**
 * Onboarding tour target registry.
 *
 * Single source of truth for the friendly names admins see in the tour-step
 * editor AND the CSS selectors the runtime uses to highlight elements.
 *
 * To add a new highlightable spot:
 *   1. Add an entry below.
 *   2. Add `data-tour="<id>"` to the corresponding element in the UI.
 *   3. Done — no changes needed in the editor or the tour runtime.
 *
 * The `selector` is what we actually pass to `document.querySelector`. We
 * keep it as a separate field (rather than always deriving from `id`) so
 * future targets can reuse existing DOM hooks if needed.
 */

export type TourTarget = {
  /** Stable id; what `data-tour` resolves to. */
  id: string;
  /** Friendly label shown in the admin editor dropdown. */
  label: string;
  /** One-line description. Helps admins pick the right one. */
  hint: string;
  /** Actual CSS selector used at runtime to find the element. */
  selector: string;
};

export const TOUR_TARGETS: TourTarget[] = [
  // ── Top group chrome ─────────────────────────────────────────────────────
  {
    id: "group-header",
    label: "Group header",
    hint: "The big group title and avatar at the top.",
    selector: '[data-tour="group-header"]',
  },
  {
    id: "groups-tabs",
    label: "All group tabs",
    hint: "The whole row of tabs (Discussion, Events, Members, …).",
    selector: '[data-tour="groups-tabs"]',
  },

  // ── Individual tabs ──────────────────────────────────────────────────────
  {
    id: "tab-discussion",
    label: "Discussion tab",
    hint: "The Feed / Discussion tab.",
    selector: '[data-tour="tab-discussion"]',
  },
  {
    id: "tab-learning",
    label: "Learning tab",
    hint: "Courses & lessons tab.",
    selector: '[data-tour="tab-learning"]',
  },
  {
    id: "tab-events",
    label: "Events tab",
    hint: "Live events & calendar tab.",
    selector: '[data-tour="tab-events"]',
  },
  {
    id: "tab-leaderboard",
    label: "Leaderboard tab",
    hint: "Member ranking by points.",
    selector: '[data-tour="tab-leaderboard"]',
  },
  {
    id: "tab-members",
    label: "Members tab",
    hint: "Admin-only roster (only shown if visible to the viewer).",
    selector: '[data-tour="tab-members"]',
  },
  {
    id: "tab-about",
    label: "About tab",
    hint: "Group description & rules tab.",
    selector: '[data-tour="tab-about"]',
  },

  // ── Discussion page ──────────────────────────────────────────────────────
  {
    id: "channels-list",
    label: "Channels sidebar",
    hint: "The list of channels on the left of the Discussion page.",
    selector: '[data-tour="channels-list"]',
  },
  {
    id: "composer",
    label: "Post composer",
    hint: '"Write something…" box at the top of the feed.',
    selector: '[data-tour="composer"]',
  },
  {
    id: "right-rail",
    label: "Right rail",
    hint: "The members / online panel on the right.",
    selector: '[data-tour="right-rail"]',
  },
];

/** Lookup by id — handy if the editor wants to re-display a friendly label. */
export const TOUR_TARGET_BY_ID: Record<string, TourTarget> = Object.fromEntries(
  TOUR_TARGETS.map((t) => [t.id, t]),
);
