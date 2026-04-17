import { getTranslations } from "next-intl/server";

// Chat tab inside a channel. Thread + participants are provisioned in M3,
// but live messaging UI + Pusher wiring lands in M8.
export default async function ChannelChatPage() {
  const t = await getTranslations("channels.empty_page");

  return (
    <section className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <h2 className="text-base font-semibold">{t("chatTitle")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {t("chatBody")}
      </p>
    </section>
  );
}
