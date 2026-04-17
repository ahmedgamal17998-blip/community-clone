/**
 * next-intl request-scoped config.
 *
 * Locale resolution order:
 *   1. The `NEXT_LOCALE` cookie (set by our LocaleToggle)
 *   2. The authenticated user's `locale` field (future; we'd read session here)
 *   3. Default: "en"
 *
 * Supported: "en" (ltr), "ar" (rtl).
 */
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED = ["en", "ar"] as const;
export type Locale = (typeof SUPPORTED)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (SUPPORTED as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get("NEXT_LOCALE")?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
