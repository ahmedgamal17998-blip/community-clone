import { Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";

const hasResend = Boolean(process.env.AUTH_RESEND_KEY);

export default async function VerifyPage() {
  const t = await getTranslations("verify");
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Mail className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      {!hasResend && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("devHint")}
        </p>
      )}
    </div>
  );
}
