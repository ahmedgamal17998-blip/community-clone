"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startDirectThreadAction } from "@/server/chat";

export function MessageUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      const res = await startDirectThreadAction(fd);
      if (res?.ok) router.push(`/chat/${res.threadId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handle} disabled={loading} variant="outline" size="sm" className="gap-1">
      <MessageCircle className="h-4 w-4" />
      Message
    </Button>
  );
}
