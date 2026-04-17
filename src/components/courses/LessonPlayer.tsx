import ReactMarkdown from "react-markdown";

type Props = {
  title: string;
  videoUrl?: string | null;
  body?: string | null;
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
      // /embed/XYZ already
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
    // fallthrough to html5
  }
  return { kind: "html5", src: url };
}

export function LessonPlayer({ title, videoUrl, body }: Props) {
  let embed: { kind: "youtube" | "vimeo" | "html5"; src: string } | null = null;
  if (videoUrl) embed = detectEmbed(videoUrl);

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
          <ReactMarkdown>{body}</ReactMarkdown>
        </article>
      ) : null}
    </div>
  );
}
