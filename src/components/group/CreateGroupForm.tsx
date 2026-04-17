"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createGroupAction } from "@/server/groups";
import { cn } from "@/lib/utils";

// Curated preset palette stored as HSL triplets (matches our CSS var convention).
// Users can pick one; power users type any triplet in the text input that appears.
const PRESETS: Array<{ label: string; hsl: string }> = [
  { label: "Purple",    hsl: "263 74% 58%" },
  { label: "Indigo",    hsl: "239 72% 58%" },
  { label: "Blue",      hsl: "217 91% 56%" },
  { label: "Teal",      hsl: "174 72% 36%" },
  { label: "Green",     hsl: "142 66% 41%" },
  { label: "Orange",    hsl: "16 85% 55%" },
  { label: "Red",       hsl: "0 78% 54%" },
  { label: "Pink",      hsl: "332 78% 60%" },
];

type State = { ok: boolean; error?: string } | null;

export function CreateGroupForm() {
  const t = useTranslations("groups.wizard");
  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await createGroupAction(prev, formData);
      return result ?? prev;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required minLength={2} maxLength={60} placeholder={t("namePlaceholder")} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea id="description" name="description" rows={3} maxLength={500} placeholder={t("descriptionPlaceholder")} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("visibility")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["PUBLIC", "PRIVATE", "HIDDEN"] as const).map((v, i) => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-canvas p-3 text-sm hover:border-primary has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                defaultChecked={i === 0}
                className="mt-0.5 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">{t(`visibilityOptions.${v.toLowerCase()}`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(`visibilityHints.${v.toLowerCase()}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("primaryColor")}</legend>
        <ColorPicker />
      </fieldset>

      {state && state.ok === false && state.error ? (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <SubmitButton idle={t("create")} busy={t("creating")} />
      </div>
    </form>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

// ─── Color picker subcomponent ────────────────────────────────────────────

import { useState } from "react";

function ColorPicker() {
  const [selected, setSelected] = useState<string>(PRESETS[0].hsl);

  return (
    <>
      <input type="hidden" name="primaryHsl" value={selected} />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = p.hsl === selected;
          return (
            <button
              key={p.hsl}
              type="button"
              onClick={() => setSelected(p.hsl)}
              title={p.label}
              aria-label={p.label}
              aria-pressed={active}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition",
                active ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: `hsl(${p.hsl})` }}
            />
          );
        })}
      </div>
    </>
  );
}
