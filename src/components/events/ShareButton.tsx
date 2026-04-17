"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {copied ? "✓ Copied" : "+ Share"}
    </Button>
  );
}
