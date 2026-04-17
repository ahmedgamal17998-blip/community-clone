"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateGroupAction } from "@/server/groups";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ label: string; hsl: string }> = [
  { label: "Purple", hsl: "263 74% 58%" },
  { label: "Indigo", hsl: "239 72% 58%" },
  { label: "Blue",   hsl: "217 91% 56%" },
  { label: "Teal",   hsl: "174 72% 36%" },
  { label: "Green",  hsl: "142 66% 41%" },
  { label: "Orange", hsl: "16 85% 55%" },
  { label: "Red",    hsl: "0 78% 54%" },
  { label: "Pink",   hsl: "332 78% 60%" },
];

type State = { ok: boolean; error?: string } | null;

type Props = {
  group: {
    id: string;
    name: string;
    description: string | null;
    visibility: string;
    primaryHsl: string;
  };
};

export function EditGroupForm({ group }: Props) {
  const t = useTranslations("groups.settingsPage");
  const tWiz = useTranslations("groups.wizard");
  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await updateGroupAction(prev, formData);
      return result ?? prev;
    },
    null,
  );
  const [color, setColor] = useState(group.primaryHsl);

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-border bg-card p-6">
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="primaryHsl" value={color} />

      <div className="space-y-1.5">
        <Label htmlFor="name">{tWiz("name")}</Label>
        <Input id="name" name="name" required minLength={2} maxLength={60} defaultValue={group.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">{tWiz("description")}</Label>
        <Textarea id="description" name="description" rows={3} maxLength={500} defaultValue={group.description ?? ""} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tWiz("visibility")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["PUBLIC", "PRIVATE", "HIDDEN"] as const).map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-canvas p-3 text-sm hover:border-primary has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                defaultChecked={group.visibility === v}
                className="mt-0.5 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">{tWiz(`visibilityOptions.${v.toLowerCase()}`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {tWiz(`visibilityHints.${v.toLowerCase()}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tWiz("primaryColor")}</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = p.hsl === color;
            return (
              <button
                key={p.hsl}
                type="button"
                onClick={() => setColor(p.hsl)}
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
      </fieldset>

      {state && state.ok === false && state.error ? (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="text-sm text-[hsl(var(--presence-online))]">{t("saved")}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <SubmitButton idle={t("save")} busy={t("saving")} />
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
