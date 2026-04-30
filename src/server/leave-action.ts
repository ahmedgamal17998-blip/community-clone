"use server";

/**
 * Tiny server-action wrapper around `leaveGroupAction` so that client
 * components (like LeavePopup) can receive a stable function reference
 * via props without depending on an inline closure inside JSX.
 *
 * Inline `async () => { "use server"; … }` closures defined inside a
 * server component's render works in some Next.js builds but is flaky
 * across edge cases (closure capture + Server Actions ID hashing).
 * A dedicated "use server" file is the supported pattern.
 */

import { leaveGroupAction } from "@/server/groups";

export async function leaveGroupActionByIdAction(groupId: string) {
  const fd = new FormData();
  fd.set("groupId", groupId);
  await leaveGroupAction(fd);
}
