"use client";

/**
 * CheckoutModal — embeds the external payment page inside a fullscreen
 * overlay so the member never leaves the community.
 *
 * The checkout URL is built server-side from the session user's email/name,
 * so those fields are pre-filled and the identity is tied to the logged-in
 * account rather than whatever the member types.
 *
 * On mobile the iframe fills the full viewport; on desktop it opens as a
 * centred, scrollable sheet.
 */
import { X, ExternalLink } from "lucide-react";

type Props = {
  checkoutUrl: string;
  onClose: () => void;
};

export function CheckoutModal({ checkoutUrl, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-stretch bg-black/60 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      {/* Dialog card */}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-none bg-background shadow-2xl md:h-[90vh] md:max-h-[900px] md:w-full md:max-w-2xl md:rounded-2xl">

        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Complete your payment</p>
            <p className="text-[11px] text-muted-foreground">
              Your identity is pre-filled from your account and cannot be changed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Escape hatch — open in new tab if iframe is blocked */}
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close checkout"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Iframe */}
        <iframe
          src={checkoutUrl}
          className="min-h-0 flex-1 w-full border-0"
          title="Payment checkout"
          allow="payment"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation"
        />
      </div>
    </div>
  );
}
