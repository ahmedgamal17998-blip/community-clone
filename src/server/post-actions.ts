"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hasMinRole, type Role } from "@/server/permissions";
import { encodeMedia } from "@/server/posts";
import { notifyMentions } from "@/server/notifications";
import { addPoints } from "@/server/points";

// ─── Shared: permission & access gate for a channel ────────────────────────

async function canWriteToChannel(params: {
  channelId: string;
  userId: string;
}): Promise<
  | { ok: true; channel: { id: string; groupId: string; kind: string; slug: string; group: { slug: string } } }
  | { ok: false; error: string }
> {
  const channel = await db.channel.findUnique({
    where: { id: params.channelId },
    include: {
      group: { select: { slug: true } },
      accesses: { where: { userId: params.userId }, select: { id: true } },
    },
  });
  if (!channel || channel.archived) {
    return { ok: false, error: "Channel not found" };
  }

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: channel.groupId, userId: params.userId },
    },
    select: { role: true, state: true },
  });
  if (!membership || membership.state !== "ACTIVE") {
    return { ok: false, error: "Not a member" };
  }

  // ANNOUNCEMENT channels: only ADMIN+ can post.
  if (channel.kind === "ANNOUNCEMENT" && !hasMinRole(membership.role as Role, "ADMIN")) {
    return { ok: false, error: "Only admins can post here" };
  }

  // PRIVATE channels: admins pass, others need a grant.
  if (channel.kind === "PRIVATE") {
    const isAdmin = hasMinRole(membership.role as Role, "ADMIN");
    const hasGrant = channel.accesses.length > 0;
    if (!isAdmin && !hasGrant) return { ok: false, error: "No access" };
  }

  return {
    ok: true,
    channel: {
      id: channel.id,
      groupId: channel.groupId,
      kind: channel.kind,
      slug: channel.slug,
      group: channel.group,
    },
  };
}

// ─── Create post ───────────────────────────────────────────────────────────

const urlList = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return [] as string[];
    return v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .pipe(z.array(z.string().url()).max(10));

const pollOptionList = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return [] as string[];
    return v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .pipe(z.array(z.string().min(1).max(200)).max(5));

const createSchema = z.object({
  channelId: z.string().cuid(),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(50_000),
  mediaUrls: urlList,
  pollQuestion: z.string().trim().max(500).optional(),
  pollOptions: pollOptionList,
  pollMultipleChoice: z.enum(["1", "0"]).optional(),
});

export async function createPostAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  // ── Resolve target channel(s) ───────────────────────────────────────────
  // The composer may submit multiple `channelIds` (admin cross-post) OR a
  // single `channelId` (regular post). Cross-post requires CROSSPOST.
  const multiTargets = formData.getAll("channelIds").map(String).filter(Boolean);
  const fallback = (formData.get("channelId") as string) || "";
  const targets = (multiTargets.length > 0 ? multiTargets : [fallback]).filter(Boolean);

  if (targets.length === 0) {
    return { ok: false as const, error: "No channel selected" };
  }

  // ── Parse the rest of the post payload (channel-independent) ────────────
  const parsed = createSchema.safeParse({
    channelId: targets[0], // schema needs *some* cuid; we don't actually use this field for the loop below
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    mediaUrls: formData.get("mediaUrls") ?? "",
    pollQuestion: formData.get("pollQuestion") || undefined,
    pollOptions: formData.get("pollOptions") ?? "",
    pollMultipleChoice: formData.get("pollMultipleChoice") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // ── Cross-post capability gate ──────────────────────────────────────────
  if (targets.length > 1) {
    const { hasCapability } = await import("@/server/capabilities");
    // We need a groupId — derive from the first target.
    const firstChannel = await db.channel.findUnique({
      where: { id: targets[0] },
      select: { groupId: true },
    });
    if (!firstChannel) {
      return { ok: false as const, error: "Channel not found" };
    }
    const allowed = await hasCapability({
      userId: session.user.id,
      groupId: firstChannel.groupId,
      capability: "CROSSPOST",
    });
    if (!allowed) {
      return {
        ok: false as const,
        error: "Cross-posting requires admin permission",
      };
    }
  }

  // ── Merge media ─────────────────────────────────────────────────────────
  let uploaded: string[] = [];
  try {
    const raw = formData.get("uploadedImageUrls");
    if (typeof raw === "string" && raw) uploaded = JSON.parse(raw);
    if (!Array.isArray(uploaded)) uploaded = [];
  } catch {
    uploaded = [];
  }
  const mergedMedia = [...parsed.data.mediaUrls, ...uploaded];

  const hasPoll =
    !!parsed.data.pollQuestion && parsed.data.pollOptions.length >= 2;

  // ── Create one post per target channel ──────────────────────────────────
  const created: { postId: string; channelSlug: string; groupSlug: string }[] = [];
  for (const channelId of targets) {
    const gate = await canWriteToChannel({
      channelId,
      userId: session.user.id,
    });
    if (!gate.ok) {
      // For cross-post with mixed permissions, skip channels we can't post to
      // rather than failing the entire batch. Log so the user can debug.
      if (targets.length > 1) {
        // eslint-disable-next-line no-console
        console.warn(`cross-post: skipped ${channelId} — ${gate.error}`);
        continue;
      }
      return { ok: false as const, error: gate.error };
    }

    const post = await db.post.create({
      data: {
        channelId,
        authorId: session.user.id,
        title: parsed.data.title,
        body: parsed.data.body,
        mediaUrls: encodeMedia(mergedMedia),
        ...(hasPoll
          ? {
              poll: {
                create: {
                  question: parsed.data.pollQuestion!,
                  multipleChoice: parsed.data.pollMultipleChoice === "1",
                  options: {
                    create: parsed.data.pollOptions.map((text, i) => ({
                      text,
                      order: i,
                    })),
                  },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    created.push({
      postId: post.id,
      channelSlug: gate.channel.slug,
      groupSlug: gate.channel.group.slug,
    });

    revalidatePath(`/groups/${gate.channel.group.slug}`);
    revalidatePath(
      `/groups/${gate.channel.group.slug}/channels/${gate.channel.slug}`,
    );

    // Points: only credit the first one to avoid points farming via cross-post.
    if (created.length === 1) {
      try {
        await addPoints({
          userId: session.user.id,
          groupId: gate.channel.groupId,
          delta: 5,
          reason: "POST",
          refType: "post",
          refId: post.id,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("addPoints (post) failed", e);
      }
    }

    // Mention notifications fire on every cross-post (so mentioned users get
    // pinged once per channel).
    try {
      await notifyMentions({
        text: parsed.data.body,
        actorId: session.user.id,
        groupId: gate.channel.groupId,
        href: `/groups/${gate.channel.group.slug}/channels/${gate.channel.slug}#post-${post.id}`,
        snippet: parsed.data.body,
        postId: post.id,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("notifyMentions (post) failed", e);
    }
  }

  if (created.length === 0) {
    return { ok: false as const, error: "Could not post to any channel" };
  }

  return { ok: true as const, postId: created[0].postId };
}

// ─── Edit post ─────────────────────────────────────────────────────────────

const editSchema = z.object({
  postId: z.string().cuid(),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(50_000),
  mediaUrls: urlList,
});

export async function editPostAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = editSchema.safeParse({
    postId: formData.get("postId"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    mediaUrls: formData.get("mediaUrls") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    include: { channel: { include: { group: { select: { slug: true } } } } },
  });
  if (!post) return { ok: false as const, error: "Not found" };

  // Author can always edit own; ADMIN+ can edit any post in their group.
  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: post.channel.groupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  const isAdmin =
    !!membership &&
    membership.state === "ACTIVE" &&
    hasMinRole(membership.role as Role, "ADMIN");
  if (post.authorId !== session.user.id && !isAdmin) {
    return { ok: false as const, error: "Forbidden" };
  }

  await db.post.update({
    where: { id: post.id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      mediaUrls: encodeMedia(parsed.data.mediaUrls),
      editedAt: new Date(),
    },
  });

  revalidatePath(`/groups/${post.channel.group.slug}`);
  revalidatePath(
    `/groups/${post.channel.group.slug}/channels/${post.channel.slug}`,
  );
  return { ok: true as const };
}

// ─── Delete post (author or admin+) ────────────────────────────────────────

const idSchema = z.object({ postId: z.string().cuid() });

export async function deletePostAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = idSchema.safeParse({ postId: formData.get("postId") });
  if (!parsed.success) return;

  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    include: { channel: { include: { group: { select: { slug: true } } } } },
  });
  if (!post) return;

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: post.channel.groupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  const isAdmin =
    !!membership &&
    membership.state === "ACTIVE" &&
    hasMinRole(membership.role as Role, "ADMIN");
  if (post.authorId !== session.user.id && !isAdmin) {
    throw new Error("FORBIDDEN");
  }

  await db.post.delete({ where: { id: post.id } });

  revalidatePath(`/groups/${post.channel.group.slug}`);
  revalidatePath(
    `/groups/${post.channel.group.slug}/channels/${post.channel.slug}`,
  );
}

// ─── Pin / unpin (admin+ only) ─────────────────────────────────────────────

const pinSchema = z.object({
  postId: z.string().cuid(),
  pinned: z.enum(["1", "0"]),
});

export async function togglePinAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const parsed = pinSchema.safeParse({
    postId: formData.get("postId"),
    pinned: formData.get("pinned"),
  });
  if (!parsed.success) return;

  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    include: { channel: { include: { group: { select: { slug: true } } } } },
  });
  if (!post) return;

  const membership = await db.groupMembership.findUnique({
    where: {
      groupId_userId: { groupId: post.channel.groupId, userId: session.user.id },
    },
    select: { role: true, state: true },
  });
  if (
    !membership ||
    membership.state !== "ACTIVE" ||
    !hasMinRole(membership.role as Role, "ADMIN")
  ) {
    throw new Error("FORBIDDEN");
  }

  await db.post.update({
    where: { id: post.id },
    data: { pinned: parsed.data.pinned === "1" },
  });

  revalidatePath(`/groups/${post.channel.group.slug}`);
  revalidatePath(
    `/groups/${post.channel.group.slug}/channels/${post.channel.slug}`,
  );
}

// ─── Redirect-only create (when used from dedicated /new page) ─────────────

export async function createPostAndRedirect(formData: FormData) {
  const result = await createPostAction(null, formData);
  if (result?.ok) {
    // Redirect to the channel the post was written in.
    const channelId = formData.get("channelId") as string;
    const ch = await db.channel.findUnique({
      where: { id: channelId },
      include: { group: { select: { slug: true } } },
    });
    if (ch) redirect(`/groups/${ch.group.slug}/channels/${ch.slug}`);
  }
}
