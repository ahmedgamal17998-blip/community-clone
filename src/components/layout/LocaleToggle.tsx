"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LOCALES = [
  { value: "en", labelKey: "english" as const },
  { value: "ar", labelKey: "arabic" as const },
];

export function LocaleToggle() {
  const router = useRouter();
  const t = useTranslations("locale");
  const [, startTransition] = useTransition();

  const setLocale = (value: string) => {
    // 1-year cookie — next-intl reads it on the next request.
    document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("toggle")} title={t("toggle")}>
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l.value} onSelect={() => setLocale(l.value)}>
            {t(l.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
