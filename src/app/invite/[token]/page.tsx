import Link from "next/link";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { acceptInviteAction } from "@/server/invite-actions";

export default async function InviteAcceptPage({
  params,
}: {
  params: { token: string };
}) {
  const session = await auth();

  const invite = await db.invite.findUnique({
    where: { token: params.token },
    include: {
      group: { select: { slug: true, name: true } },
      invitedBy: { select: { name: true, handle: true } },
    },
  });

  const wrapper = "mx-auto mt-20 max-w-md rounded-xl border border-border bg-card p-6 shadow-sm";

  if (!invite) {
    return (
      <div className={wrapper}>
        <h1 className="text-lg font-semibold">Invite not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link doesn&apos;t match any invite. It may have been revoked.
        </p>
      </div>
    );
  }

  if (invite.revokedAt) {
    return (
      <div className={wrapper}>
        <h1 className="text-lg font-semibold">Invite revoked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invite was revoked by an admin.
        </p>
      </div>
    );
  }

  if (invite.acceptedAt) {
    return (
      <div className={wrapper}>
        <h1 className="text-lg font-semibold">Already accepted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invite has already been used.
        </p>
        <Link
          href={`/groups/${invite.group.slug}`}
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Go to {invite.group.name}
        </Link>
      </div>
    );
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <div className={wrapper}>
        <h1 className="text-lg font-semibold">Invite expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the person who invited you to send a new link.
        </p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className={wrapper}>
        <h1 className="text-lg font-semibold">You&apos;re invited to {invite.group.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invited by @{invite.invitedBy.handle} as <strong>{invite.role}</strong>. Sign
          in to accept.
        </p>
        <Link
          href={`/login?next=/invite/${invite.token}`}
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in to accept
        </Link>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <h1 className="text-lg font-semibold">You&apos;re invited to {invite.group.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Invited by @{invite.invitedBy.handle} as <strong>{invite.role}</strong>.
      </p>
      <form action={acceptInviteAction} className="mt-4">
        <input type="hidden" name="token" value={invite.token} />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Accept invite
        </button>
      </form>
    </div>
  );
}
