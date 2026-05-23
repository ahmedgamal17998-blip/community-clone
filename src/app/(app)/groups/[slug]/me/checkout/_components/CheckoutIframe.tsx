"use client";

/**
 * CheckoutIframe — client wrapper for the embedded payment iframe.
 *
 * Sits below the locked identity + order summary on the checkout page.
 * Shows a loading skeleton while the iframe loads, then reveals it.
 * Provides an "Open in new tab" escape hatch in case the payment
 * provider blocks iframe embedding (X-Frame-Options).
 */
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";

type Props = {
  checkoutUrl: string;
  groupSlug: string;
};

export function CheckoutIframe({ checkoutUrl, groupSlug }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {/* Iframe header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          Secure payment — powered by your community&apos;s payment system
        </p>
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Open in new tab
        </a>
      </div>

      {/* Loading skeleton */}
      {!loaded && (
        <div className="flex h-[520px] items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Loading payment form…</p>
          </div>
        </div>
      )}

      {/* The iframe itself */}
      <iframe
        src={checkoutUrl}
        onLoad={() => setLoaded(true)}
        className={`w-full border-0 bg-white transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0 h-0"}`}
        style={{ minHeight: loaded ? "600px" : 0 }}
        title="Payment checkout"
        allow="payment"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation"
      />

      {/* Cancel link */}
      <div className="border-t border-border bg-muted/20 px-4 py-3 text-center">
        <Link
          href={`/groups/${groupSlug}/me`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel and go back
        </Link>
      </div>
    </div>
  );
}
