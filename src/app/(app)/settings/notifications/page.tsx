import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { updateNotificationPrefsAction } from "@/server/notifications";

const EVENT_TYPES = [
  { key: "mention", label: "@mention" },
  { key: "commentOnPost", label: "Comment on your post" },
  { key: "replyOnComment", label: "Reply to your comment" },
  { key: "reactionOnPost", label: "Reaction on your post" },
  { key: "membershipApproved", label: "Membership approved" },
  { key: "inviteAccepted", label: "Invite accepted" },
] as const;

const CHANNELS = ["IN_APP", "EMAIL", "BOTH", "OFF"] as const;
const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  IN_APP: "In-App",
  EMAIL: "Email",
  BOTH: "Both",
  OFF: "Off",
};

export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const prefs = await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
  });

  const current: Record<string, string> = {
    mention: prefs.mention,
    commentOnPost: prefs.commentOnPost,
    replyOnComment: prefs.replyOnComment,
    reactionOnPost: prefs.reactionOnPost,
    membershipApproved: prefs.membershipApproved,
    inviteAccepted: prefs.inviteAccepted,
  };

  async function saveAction(formData: FormData) {
    "use server";
    await updateNotificationPrefsAction(formData);
    redirect("/settings/notifications?saved=1");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you'd like to be notified for each event type.
        </p>
      </div>

      {searchParams.saved ? (
        <p className="text-sm text-green-600">Saved.</p>
      ) : null}

      <form action={saveAction} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="divide-y divide-border">
          {EVENT_TYPES.map((e) => (
            <div
              key={e.key}
              className="flex items-center justify-between gap-3 py-3"
            >
              <label htmlFor={e.key} className="text-sm font-medium">
                {e.label}
              </label>
              <select
                id={e.key}
                name={e.key}
                defaultValue={current[e.key]}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="submit">Save preferences</Button>
        </div>
      </form>
    </div>
  );
}
