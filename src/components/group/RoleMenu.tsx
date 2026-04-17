/**
 * Kebab menu for moderators on a member row.
 *
 * Submits server actions via form POST. Each <form> posts to a named action;
 * nothing here is client-JS-dependent except the menu itself.
 */
"use client";

import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  changeRoleAction,
  decidePendingAction,
  moderateMemberAction,
} from "@/server/groups";

type Props = {
  membershipId: string;
  currentRole: string;
  currentState: string;
  /** OWNERs can grant/revoke OWNER — everyone else can't. */
  isOwnerMenu: boolean;
};

export function RoleMenu({ membershipId, currentRole, currentState, isOwnerMenu }: Props) {
  const t = useTranslations("groups.menu");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("open")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {currentState === "REQUESTED" ? (
          <>
            <DropdownMenuLabel>{t("pendingReview")}</DropdownMenuLabel>
            <form action={decidePendingAction}>
              <input type="hidden" name="membershipId" value={membershipId} />
              <input type="hidden" name="decision" value="APPROVE" />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-start">{t("approve")}</button>
              </DropdownMenuItem>
            </form>
            <form action={decidePendingAction}>
              <input type="hidden" name="membershipId" value={membershipId} />
              <input type="hidden" name="decision" value="REJECT" />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-start text-destructive">{t("reject")}</button>
              </DropdownMenuItem>
            </form>
          </>
        ) : currentState === "BANNED" ? (
          <form action={moderateMemberAction}>
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="action" value="UNBAN" />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-start">{t("unban")}</button>
            </DropdownMenuItem>
          </form>
        ) : (
          <>
            <DropdownMenuLabel>{t("changeRole")}</DropdownMenuLabel>
            {(["MEMBER", "CONTRIBUTOR", "ADMIN", ...(isOwnerMenu ? ["OWNER"] : [])] as const).map(
              (role) =>
                role === currentRole ? null : (
                  <form key={role} action={changeRoleAction}>
                    <input type="hidden" name="membershipId" value={membershipId} />
                    <input type="hidden" name="role" value={role} />
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full text-start">
                        {t(`makeRole.${role}`)}
                      </button>
                    </DropdownMenuItem>
                  </form>
                ),
            )}
            <DropdownMenuSeparator />
            {currentRole !== "OWNER" ? (
              <>
                <form action={moderateMemberAction}>
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <input type="hidden" name="action" value="BAN" />
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full text-start text-destructive">
                      {t("ban")}
                    </button>
                  </DropdownMenuItem>
                </form>
                <form action={moderateMemberAction}>
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <input type="hidden" name="action" value="REMOVE" />
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full text-start text-destructive">
                      {t("remove")}
                    </button>
                  </DropdownMenuItem>
                </form>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
