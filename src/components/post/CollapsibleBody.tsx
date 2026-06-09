"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps post body content and collapses it to 3 lines with a "See more" toggle.
 */
export function CollapsibleBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scrollHeight > clientHeight means content is taller than 3-line clamp
    setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, []);

  return (
    <div className={className}>
      <div
        ref={ref}
        className={cn(collapsed && "line-clamp-3")}
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setCollapsed((p) => !p)}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {collapsed ? "See more" : "See less"}
        </button>
      )}
    </div>
  );
}
