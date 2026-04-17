"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChannelAction } from "@/server/channel-actions";

type State = { ok: boolean; error?: string } | null;

type Props = { groupId: string };

export function CreateChannelForm({ groupId }: Props) {
  const t = useTranslations("channels.new");
  const tKinds = useTranslations("channels.kinds");
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
          {(["PUBLIC", "PRIVATE", "ANNOUNCEMENT"] as const).map((k, i) => (
            <label
              key={k}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-canvas p-3 text-sm hover:border-primary has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="kind"
                value={k}
                defaultChecked={i === 0}
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

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}
