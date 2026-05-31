"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import Mention from "@tiptap/extension-mention";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  List,
  ListOrdered,
  Quote,
  ImageIcon,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Color swatches ────────────────────────────────────────────────────────
//
// A small curated palette — pro editors expose 30+ colors, but for a
// community LMS body that's overkill and intimidating. These 6 are enough
// to highlight key terms, mark warnings, and add a brand pop without
// turning lessons into a clown show. "Reset" wipes the color back to inherit.
const COLOR_SWATCHES: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Brand", value: "hsl(var(--primary))" },
  { label: "Red", value: "#e11d48" },
  { label: "Amber", value: "#d97706" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
];

// ─── Mention suggestion list ────────────────────────────────────────────────

type MentionUser = {
  id: string;
  name: string | null;
  handle: string;
  image: string | null;
};

type MentionListProps = SuggestionProps<MentionUser> & {
  onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
};

// Simple forward-ref component for the suggestion list
function MentionList({
  items,
  command,
  onKeyDownRef,
}: {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
  onKeyDownRef: React.MutableRefObject<((props: SuggestionKeyDownProps) => boolean) | null>;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    onKeyDownRef.current = ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selectedIndex];
        if (item) {
          command({ id: item.id, label: item.handle });
        }
        return true;
      }
      if (event.key === "Escape") {
        return true;
      }
      return false;
    };
  }, [items, selectedIndex, command, onKeyDownRef]);

  if (!items.length) return null;

  return (
    <div className="z-50 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-md">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent",
            index === selectedIndex ? "bg-accent" : "",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            command({ id: item.id, label: item.handle });
          }}
        >
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt=""
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {(item.name ?? item.handle)[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate font-medium">{item.name ?? item.handle}</div>
            <div className="truncate text-xs text-muted-foreground">
              @{item.handle}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Toolbar button ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ─── Main editor component ──────────────────────────────────────────────────

type Props = {
  value?: string;
  onChange?: (json: string, html: string, text: string) => void;
  placeholder?: string;
  groupSlug?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  groupSlug,
  maxLength,
  disabled,
  className,
  minHeight = 120,
}: Props) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const onKeyDownRef = useRef<((props: SuggestionKeyDownProps) => boolean) | null>(null);

  // Build initial content from value prop
  const getInitialContent = useCallback(() => {
    if (!value) return "";
    try {
      if (value.trimStart().startsWith("{")) {
        return JSON.parse(value) as object;
      }
    } catch {
      // fall through
    }
    return value;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const extensions = [
    StarterKit.configure({
      codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: placeholder ?? "Write something…",
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Image,
    // Text-style is the marker mark; Color sets its `color` attribute. Both
    // are needed for text-color to work (Color depends on TextStyle).
    TextStyle,
    Color,
    ...(maxLength ? [CharacterCount.configure({ limit: maxLength })] : [CharacterCount]),
    ...(groupSlug
      ? [
          Mention.configure({
            HTMLAttributes: {
              class: "mention",
            },
            suggestion: {
              items: async ({ query }: { query: string }) => {
                try {
                  const res = await fetch(
                    `/api/groups/${groupSlug}/member-search?q=${encodeURIComponent(query)}`,
                  );
                  if (!res.ok) return [];
                  const data = (await res.json()) as { results: MentionUser[] };
                  return data.results ?? [];
                } catch {
                  return [];
                }
              },
              render: () => {
                let reactRendererInstance: ReactRenderer | null = null;
                let wrapper: HTMLDivElement | null = null;

                return {
                  onStart: (props: SuggestionProps<MentionUser>) => {
                    reactRendererInstance = new ReactRenderer(
                      ({ items, command }: { items: MentionUser[]; command: (item: { id: string; label: string }) => void }) => (
                        <MentionList
                          items={items}
                          command={command}
                          onKeyDownRef={onKeyDownRef}
                        />
                      ),
                      {
                        props: { items: props.items, command: props.command },
                        editor: props.editor,
                      },
                    );

                    wrapper = document.createElement("div");
                    wrapper.style.position = "absolute";
                    wrapper.style.zIndex = "9999";

                    const rect = props.clientRect?.();
                    if (rect) {
                      wrapper.style.top = `${rect.bottom + window.scrollY}px`;
                      wrapper.style.left = `${rect.left + window.scrollX}px`;
                    }
                    wrapper.appendChild(reactRendererInstance.element);
                    document.body.appendChild(wrapper);
                  },
                  onUpdate: (props: SuggestionProps<MentionUser>) => {
                    const rect = props.clientRect?.();
                    if (rect && wrapper) {
                      wrapper.style.top = `${rect.bottom + window.scrollY}px`;
                      wrapper.style.left = `${rect.left + window.scrollX}px`;
                    }
                    reactRendererInstance?.updateProps({
                      items: props.items,
                      command: props.command,
                    });
                  },
                  onKeyDown: (props: SuggestionKeyDownProps) => {
                    return onKeyDownRef.current?.(props) ?? false;
                  },
                  onExit: () => {
                    reactRendererInstance?.destroy();
                    wrapper?.remove();
                    wrapper = null;
                    reactRendererInstance = null;
                  },
                };
              },
            },
          }),
        ]
      : []),
  ];

  const editor = useEditor({
    extensions,
    content: getInitialContent(),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.(
        JSON.stringify(editor.getJSON()),
        editor.getHTML(),
        editor.getText(),
      );
    },
    editorProps: {
      attributes: {
        class: "outline-none min-h-[inherit] px-3 py-2",
        dir: "auto",
      },
    },
  });

  // Sync disabled state
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  function insertLink() {
    if (!linkUrl) return;
    editor!.chain().focus().setLink({ href: linkUrl }).run();
    setLinkUrl("");
    setLinkOpen(false);
  }

  function insertImage() {
    if (!imageUrl) return;
    editor!.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl("");
    setImageOpen(false);
  }

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleMark("underline").run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={() => setLinkOpen((v) => !v)}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        {/* Text color — small swatch grid in a dropdown. Setting "Default"
            calls unsetColor so the run inherits the surrounding text color. */}
        <div className="relative">
          <ToolbarButton
            title="Text color"
            active={colorOpen || editor.isActive("textStyle")}
            onClick={() => setColorOpen((v) => !v)}
          >
            <Palette className="h-3.5 w-3.5" />
          </ToolbarButton>
          {colorOpen ? (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setColorOpen(false)}
              />
              <div className="absolute right-0 top-full z-40 mt-1 flex w-44 flex-wrap gap-1 rounded-md border border-border bg-popover p-2 shadow-md">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (c.value === null) {
                        editor.chain().focus().unsetColor().run();
                      } else {
                        editor.chain().focus().setColor(c.value).run();
                      }
                      setColorOpen(false);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded border border-border transition-transform hover:scale-110"
                    style={
                      c.value
                        ? { backgroundColor: c.value }
                        : {
                            background:
                              "repeating-linear-gradient(45deg, hsl(var(--muted)), hsl(var(--muted)) 4px, transparent 4px, transparent 8px)",
                          }
                    }
                  >
                    <span className="sr-only">{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          title="Image URL"
          active={imageOpen}
          onClick={() => setImageOpen((v) => !v)}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {maxLength ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {charCount}/{maxLength}
          </span>
        ) : null}
      </div>

      {/* Link inline form */}
      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder="https://…"
            className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              insertLink();
            }}
            className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Insert
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Image URL inline form */}
      {imageOpen ? (
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertImage();
              }
              if (e.key === "Escape") setImageOpen(false);
            }}
            placeholder="https://example.com/image.png"
            className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              insertImage();
            }}
            className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Insert
          </button>
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:min-h-[inherit] [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:text-primary [&_.mention]:font-medium"
      />
    </div>
  );
}
