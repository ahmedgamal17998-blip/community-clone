"use client";

/**
 * Renders YouTube, Vimeo, or Loom video embeds from share URLs.
 */
export function VideoEmbed({ url }: { url: string }) {
  const embedUrl = toEmbedUrl(url);
  if (!embedUrl) return null;
  return (
    <div className="relative mt-3 w-full overflow-hidden rounded-xl bg-muted" style={{ paddingTop: "56.25%" }}>
      <iframe
        src={embedUrl}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        title="Embedded video"
      />
    </div>
  );
}

export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("?")[0];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "loom.com") {
      const id = u.pathname.replace(/^\/share\//, "").split("/")[0];
      if (id) return `https://www.loom.com/embed/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}
