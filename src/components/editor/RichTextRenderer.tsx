"use client";

import { useMemo } from "react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { cn } from "@/lib/utils";

// Extensions used for rendering (no suggestion needed on server-side render)
const renderExtensions = [
  StarterKit.configure({ codeBlock: false }),
  Link.configure({ openOnClick: false }),
  Image,
  Mention.configure({
    HTMLAttributes: { class: "mention" },
  }),
];

// Minimal HTML sanitizer for environments without DOMPurify
function stripDangerousTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function renderContent(content: string): { html: string; isPlain: boolean } {
  if (!content || !content.trim()) {
    return { html: "", isPlain: true };
  }

  // Try TipTap JSON
  if (content.trimStart().startsWith("{")) {
    try {
      const doc = JSON.parse(content) as object;
      const html = generateHTML(doc, renderExtensions);
      return { html, isPlain: false };
    } catch {
      // fall through
    }
  }

  // If it looks like HTML (contains tags)
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return { html: stripDangerousTags(content), isPlain: false };
  }

  // Plain text
  return { html: "", isPlain: true };
}

type Props = {
  content: string;
  className?: string;
};

export function RichTextRenderer({ content, className }: Props) {
  const { html, isPlain } = useMemo(() => renderContent(content), [content]);

  const baseClass = cn(
    "prose prose-sm dark:prose-invert max-w-none break-words",
    "[&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:text-primary [&_.mention]:font-medium",
    className,
  );

  if (isPlain || !html) {
    if (!content?.trim()) return null;
    return (
      <div className={baseClass}>
        {content.split("\n").map((line, i) => (
          <p key={i}>{line || <br />}</p>
        ))}
      </div>
    );
  }

  return (
    <div
      className={baseClass}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
