"use client";

import { useEffect, useState } from "react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { cn } from "@/lib/utils";

// Extensions used for client-side rich-text rendering.
// NOTE: only instantiated in the browser — generateHTML calls window APIs.
// Must mirror the editor's extension list so all marks (bold, color, etc.)
// are recognised during HTML generation.
const renderExtensions = [
  StarterKit.configure({ codeBlock: false }),
  Link.configure({ openOnClick: false }),
  Image,
  TextStyle,
  Color,
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

/**
 * Server-safe: extract readable plain text from TipTap JSON or raw HTML.
 * Used during SSR so the page shows real words (not raw JSON) on first paint.
 */
function toPlainText(content: string): string {
  if (!content?.trim()) return "";

  if (content.trimStart().startsWith("{")) {
    try {
      // Recursively walk TipTap doc JSON to collect text nodes.
      type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };
      const walk = (n: TipTapNode): string => {
        if (n.type === "text") return n.text ?? "";
        if (n.type === "hardBreak") return "\n";
        const inner = (n.content ?? []).map(walk).join("");
        const block = ["paragraph", "heading", "blockquote", "listItem"];
        return block.includes(n.type ?? "") ? inner + "\n" : inner;
      };
      return walk(JSON.parse(content) as TipTapNode).trim();
    } catch {
      /* fall through */
    }
  }

  // Raw HTML: strip tags
  if (/<[a-z]/i.test(content)) return content.replace(/<[^>]+>/g, "").trim();

  return content;
}

/**
 * Client-only: generate rich HTML.
 * Returns null on failure so the caller can fall back to plain-text.
 */
function toRichHTML(content: string): string | null {
  if (!content?.trim()) return null;

  if (content.trimStart().startsWith("{")) {
    try {
      return generateHTML(JSON.parse(content) as object, renderExtensions);
    } catch {
      /* fall through */
    }
  }

  if (/<[a-z][\s\S]*>/i.test(content)) {
    return stripDangerousTags(content);
  }

  return null;
}

type Props = {
  content: string;
  className?: string;
};

/**
 * RichTextRenderer — displays TipTap JSON, raw HTML, or plain text.
 *
 * Strategy (fixes "raw JSON flash on refresh"):
 *  • SSR / first paint: render plain text extracted from the JSON so the page
 *    shows readable words immediately (no raw `{"type":"doc",...}` visible).
 *  • After mount (useEffect): replace with the fully formatted HTML.
 *    useState(null) keeps the initial client state identical to the server
 *    state, so React hydrates without a mismatch warning.
 */
export function RichTextRenderer({ content, className }: Props) {
  // null = not yet hydrated (matches SSR); string = rich HTML ready
  const [richHtml, setRichHtml] = useState<string | null>(null);

  useEffect(() => {
    setRichHtml(toRichHTML(content));
  }, [content]);

  const baseClass = cn(
    "prose prose-sm dark:prose-invert max-w-none break-words",
    "[&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:text-primary [&_.mention]:font-medium",
    className,
  );

  // After hydration: show rich HTML (bold, links, mentions, etc.)
  if (richHtml) {
    return (
      <div
        dir="auto"
        className={baseClass}
        dangerouslySetInnerHTML={{ __html: richHtml }}
      />
    );
  }

  // SSR + pre-hydration: show plain text (never raw JSON)
  const plain = toPlainText(content);
  if (!plain) return null;
  return (
    <div dir="auto" className={baseClass}>
      {plain.split("\n").map((line, i) => (
        <p key={i}>{line || <br />}</p>
      ))}
    </div>
  );
}
