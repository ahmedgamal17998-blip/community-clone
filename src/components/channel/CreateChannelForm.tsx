"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChannelAction } from "@/server/channel-actions";
import { cn } from "@/lib/utils";

type State = { ok: boolean; error?: string } | null;

type Props = { groupId: string };

type Visibility = "LOCKED_VISIBLE" | "HIDDEN";

export function CreateChannelForm({ groupId }: Props) {
  const t = useTranslations("channels.new");
  const tKinds = useTranslations("channels.kinds");
  const [kind, setKind] = useState<"PUBLIC" | "PRIVATE" | "ANNOUNCEMENT">(
    "PUBLIC",
  );
  const [visibility, setVisibility] = useState<Visibility>("LOCKED_VISIBLE");

  const [state, formAction] = useFormState<State, FormData>(
    async (prev, formData) => {
      const result = await createChannelAction(prev, formData);
      return result ?? prev;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-border bg-card p-6">
      <input type="hidden" name="groupId" value={groupId} />

      <div className="space-y-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={40}
          placeholder={t("namePlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="emoji">{t("emoji")}</Label>
        <Input
          id="emoji"
          name="emoji"
          maxLength={4}
          placeholder={t("emojiPlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={300}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("kind")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["PUBLIC", "PRIVATE", "ANNOUNCEMENT"] as const).map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-canvas p-3 text-sm hover:border-primary has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="mt-0.5 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">{tKinds(k)}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(`kindHints.${k}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "PRIVATE" && (
        <fieldset className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
          <legend className="px-1 text-sm font-medium">
            Visibility for non-members
          </legend>
          <p className="-mt-1 text-xs text-muted-foreground">
            Members without access to this private channel will:
          </p>
          <input type="hidden" name="visibility" value={visibility} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <VisibilityOption
              value="LOCKED_VISIBLE"
              checked={visibility === "LOCKED_VISIBLE"}
              onSelect={() => setVisibility("LOCKED_VISIBLE")}
              icon={<Eye className="h-4 w-4" />}
              title="See it (locked)"
              description="Channel appears dimmed in the sidebar with a lock icon. Clicking opens an upgrade prompt."
            />
            <VisibilityOption
              value="HIDDEN"
              checked={visibility === "HIDDEN"}
              onSelect={() => setVisibility("HIDDEN")}
              icon={<EyeOff className="h-4 w-4" />}
              title="Not see it at all"
              description="Channel is completely invisible until the member is granted access."
            />
          </div>
        </fieldset>
      )}

      {state && state.ok === false && state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <SubmitButton idle={t("create")} busy={t("creating")} />
      </div>
    </form>
  );
}

function VisibilityOption({
  value,
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  value: Visibility;
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      data-value={value}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-start text-sm transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-primary bg-primary" : "border-border",
        )}
      />
      <span className="flex-1">
        <span className="flex items-center gap-1.5 font-medium">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
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
