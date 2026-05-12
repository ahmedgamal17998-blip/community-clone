import ReactMarkdown from "react-markdown";
import { Paperclip, Download } from "lucide-react";

type Resource = { url: string; name: string; size?: number };

type Props = {
  title: string;
  videoUrl?: string | null;
  body?: string | null;
  resources?: string | null;
};

function detectEmbed(
  url: string,
): { kind: "youtube" | "vimeo" | "html5"; src: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
      if (u.pathname.startsWith("/embed/")) {
        return { kind: "youtube", src: url };
      }
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) {
        return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
      }
    }
  } catch {
    /* fallthrough */
  }
  return { kind: "html5", src: url };
}

function parseResources(json: string | null | undefined): Resource[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.filter((r) => r?.url);
  } catch {
    /* ignore */
  }
  return [];
}

export function LessonPlayer({ title, videoUrl, body, resources }: Props) {
  let embed: { kind: "youtube" | "vimeo" | "html5"; src: string } | null = null;
  if (videoUrl) embed = detectEmbed(videoUrl);

  const resourceList = parseResources(resources);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {embed ? (
        embed.kind === "html5" ? (
          <video
            controls
            playsInline
            src={embed.src}
            className="aspect-video w-full rounded-xl bg-black"
          />
        ) : (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={embed.src}
              title={title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        )
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
          No video attached
        </div>
      )}
      {body ? (
        <article className="prose prose-sm max-w-none dark:prose-invert">
          {/* M28+: lesson body comes from the TipTap RichTextEditor as HTML.
              Old lessons authored with the previous plain-markdown textarea
              still exist in the DB, so we detect by leading `<` and fall
              back to ReactMarkdown for them. The HTML is admin-authored
              and arrives from a constrained TipTap toolbar (no script /
              iframe nodes registered), so the surface is small — but
              follow-up: pipe through DOMPurify on save for defense in
              depth in case an admin account is compromised. */}
          {body.trimStart().startsWith("<") ? (
            <div dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <ReactMarkdown>{body}</ReactMarkdown>
          )}
        </article>
      ) : null}

      {resourceList.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Paperclip className="h-4 w-4 text-primary" />
            Downloadable resources
          </h3>
          <ul className="space-y-1.5">
            {resourceList.map((r, i) => (
              <li key={`${r.url}-${i}`}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.size && (
                    <span className="text-xs text-muted-foreground">
                      {(r.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
