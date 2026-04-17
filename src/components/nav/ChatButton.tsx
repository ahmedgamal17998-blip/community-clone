"use client";

/**
 * Chat top-nav button with unread badge. Polls /api/chat/unread-count every 30s.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatButton({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  const mountedRef = useRef(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      if (mountedRef.current) setCount(data.count ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCount();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") fetchCount();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchCount]);

  return (
    <Button asChild variant="ghost" size="sm" className="relative gap-2" aria-label={label}>
      <Link href="/chat">
        <MessageCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
        {count > 0 ? (
          <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
