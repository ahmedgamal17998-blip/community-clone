import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ProfileInput = z.object({
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(280).optional().nullable(),
  emailPublic: z.enum(["on", "off"]).optional(),
  locale: z.enum(["en", "ar"]),
});

export default async function SettingsProfilePage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("profile");
  const tLocale = await getTranslations("locale");

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      bio: true,
      email: true,
      handle: true,
      locale: true,
      emailPublic: true,
    },
  });
  if (!me) redirect("/login");

  async function save(formData: FormData) {
    "use server";
    const raw = {
      name: String(formData.get("name") ?? ""),
      bio: (formData.get("bio") ? String(formData.get("bio")) : "") || null,
      emailPublic: (formData.get("emailPublic") as "on" | null) ?? "off",
      locale: String(formData.get("locale") ?? "en"),
    };
    const parsed = ProfileInput.parse(raw);
    const s = await auth();
    if (!s?.user) throw new Error("Unauthorized");
    await db.user.update({
      where: { id: s.user.id },
      data: {
        name: parsed.name,
        bio: parsed.bio,
        emailPublic: parsed.emailPublic === "on",
        locale: parsed.locale,
      },
    });
    revalidatePath("/settings/profile");
    revalidatePath(`/profile/${s.user.handle}`);
    redirect("/settings/profile?saved=1");
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>

      {searchParams.saved ? (
        <p className="mt-4 rounded-md bg-brand-100 px-3 py-2 text-sm text-brand-800">
          {t("saved")}
        </p>
      ) : null}

      <form action={save} className="mt-6 space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" defaultValue={me.name ?? ""} required maxLength={80} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="handle">{t("handle")}</Label>
          <Input id="handle" name="handle" defaultValue={`@${me.handle}`} disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" defaultValue={me.email ?? ""} disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{t("bio")}</Label>
          <Textarea
            id="bio"
            name="bio"
            defaultValue={me.bio ?? ""}
            placeholder={t("bioPlaceholder")}
            maxLength={280}
            className="dir-auto"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="locale">{t("locale")}</Label>
          <select
            id="locale"
            name="locale"
            defaultValue={me.locale}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="en">{tLocale("english")}</option>
            <option value="ar">{tLocale("arabic")}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="emailPublic"
            defaultChecked={me.emailPublic}
            className="h-4 w-4 rounded border-input"
          />
          <span>{t("emailPublic")}</span>
        </label>

        <Button type="submit" size="lg">
          {t("save")}
        </Button>
      </form>
    </section>
  );
}
