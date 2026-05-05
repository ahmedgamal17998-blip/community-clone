"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { openPaywall } from "@/components/access/PaywallPopup";

type Offering = {
  id: string;
  label: string;
  tooltipText: string | null;
  state: "ACCESS" | "LOCKED";
};

/**
 * Two-pane booking surface: a list of offerings on the left, the Booky
 * embed iframe on the right. Selecting an offering hits
 * /api/booky/sso to mint a token and points the iframe at Booky's
 * embed URL with the token attached. The token comps payment for
 * subscribers — they only pick a slot.
 */
export function BookingEmbedClient({
  groupSlug,
  offerings,
  initialSelectedId,
  initialAccessible,
}: {
  groupSlug: string;
  offerings: Offering[];
  initialSelectedId: string | null;
  initialAccessible: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setEmbedUrl(null);
      return;
    }
    const offering = offerings.find((o) => o.id === selectedId);
    if (!offering || offering.state !== "ACCESS") {
      // Locked offerings don't fetch a token — paywall is shown instead.
      setEmbedUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEmbedUrl(null);

    fetch("/api/booky/sso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offeringId: selectedId }),
    })
      .then(async (res) => {
        // Response may be empty on 5xx; read raw text first then JSON-parse
        // defensively so a stripped body shows as a friendly message.
        const raw = await res.text();
        let parsed: { embedUrl?: string; error?: string; detail?: string } = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { error: "BAD_RESPONSE", detail: raw.slice(0, 200) };
          }
        }
        if (cancelled) return;
        if (res.ok && parsed.embedUrl) {
          setEmbedUrl(parsed.embedUrl);
        } else {
          setError(
            humanizeSsoError(parsed.error ?? `HTTP_${res.status}`) +
              (parsed.detail ? ` (${parsed.detail})` : ""),
          );
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to start the booking session",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, offerings]);

  // Initial paywall when navigated to a locked offering directly.
  useEffect(() => {
    if (!initialAccessible && initialSelectedId) {
      const o = offerings.find((x) => x.id === initialSelectedId);
      if (o) openPaywall({ groupSlug, resourceLabel: o.label });
    }
    // We only want this on the very first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Offering list */}
      <aside className="space-y-2 lg:sticky lg:top-[14rem] lg:self-start">
        {offerings.map((o) => {
          const active = o.id === selectedId;
          if (o.state === "LOCKED") {
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  openPaywall({ groupSlug, resourceLabel: o.label })
                }
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                  "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                <Lock className="mt-0.5 h-3.5 w-3.5 opacity-70" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium line-through decoration-muted-foreground/30">
                    {o.label}
                  </div>
                  {o.tooltipText && (
                    <div className="mt-0.5 line-clamp-2 text-[11px]">
                      {o.tooltipText}
                    </div>
                  )}
                </div>
              </button>
            );
          }
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{o.label}</div>
                {o.tooltipText && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {o.tooltipText}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </aside>

      {/* Iframe pane */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {!selectedId ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Select a session from the list to start booking.
          </div>
        ) : loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Loading booking page…
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : embedUrl ? (
          <iframe
            key={selectedId}
            src={embedUrl}
            title="Book a session"
            className="block h-[800px] w-full border-0"
            // Booky is on a different origin — iframe sandbox stays default.
            allow="clipboard-write *"
          />
        ) : null}
      </div>
    </div>
  );
}

function humanizeSsoError(code: string): string {
  switch (code) {
    case "PAYWALLED":
      return "You need an active plan that includes this session.";
    case "FORBIDDEN":
      return "You're not an active member of this group.";
    case "NO_EMAIL_ON_ACCOUNT":
      return "Add an email to your profile before booking.";
    case "OFFERING_NOT_FOUND":
      return "This session is no longer available.";
    case "UNAUTHENTICATED":
      return "Please sign in again.";
    case "SSO_CONFIG_MISSING":
      return "Booking is not fully configured yet — the BOOKY_SSO_SECRET env var is missing on this deployment.";
    case "BAD_RESPONSE":
      return "The booking server returned an unexpected response.";
    default:
      if (code.startsWith("HTTP_")) {
        return `Couldn't start the booking session (${code}).`;
      }
      return "Couldn't start the booking session.";
  }
}
