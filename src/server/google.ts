/**
 * Google OAuth + Calendar + Meet layer (M11).
 *
 * Only server code; never import from a client component. All refresh tokens
 * are stored encrypted (see src/lib/crypto-box.ts).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { google, type Auth, type calendar_v3 } from "googleapis";
import { db } from "@/server/db";
import { sealBox, openBox } from "@/lib/crypto-box";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.created",
];

export function getOAuth2Client(): Auth.OAuth2Client {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect =
    process.env.GOOGLE_OAUTH_REDIRECT_URL ||
    `${inferBaseUrl()}/api/google/callback`;
  if (!id || !secret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured",
    );
  }
  return new google.auth.OAuth2(id, secret, redirect);
}

function inferBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

export function buildAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

export async function exchangeCode(code: string): Promise<{
  tokens: Auth.Credentials;
  userInfo: GoogleUserInfo;
}> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Fetch userinfo with the access token.
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  const d = me.data;
  const userInfo: GoogleUserInfo = {
    sub: d.id ?? "",
    email: d.email ?? "",
    name: d.name ?? null,
    picture: d.picture ?? null,
  };
  return { tokens, userInfo };
}

/** Load GoogleAccount + return an authed OAuth2 client. Refreshes if near expiry. */
export async function getClientForUser(
  userId: string,
): Promise<{ client: Auth.OAuth2Client; accountId: string } | null> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return null;

  const client = getOAuth2Client();
  const refreshToken = openBox(row.refreshTokenEnc);

  client.setCredentials({
    access_token: row.accessToken || undefined,
    refresh_token: refreshToken,
    expiry_date: row.accessTokenExpiresAt.getTime(),
    scope: row.scope,
  });

  const now = Date.now();
  const soon = row.accessTokenExpiresAt.getTime() - 60_000;
  if (!row.accessToken || now >= soon) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await db.googleAccount.update({
        where: { id: row.id },
        data: {
          accessToken: credentials.access_token ?? "",
          accessTokenExpiresAt: new Date(credentials.expiry_date ?? Date.now() + 55 * 60_000),
          scope: credentials.scope ?? row.scope,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[google] refresh failed", err);
      return null;
    }
  }

  return { client, accountId: row.id };
}

export async function createCalendarEventWithMeet(params: {
  hostUserId: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  description?: string | null;
  timezone: string;
  attendees: Array<{ email: string; name?: string | null }>;
  inviteeSendUpdates?: boolean;
}): Promise<{
  eventId: string;
  htmlLink: string | null;
  meetLink: string | null;
  conferenceId: string | null;
  calendarId: string;
} | null> {
  const authed = await getClientForUser(params.hostUserId);
  if (!authed) return null;
  const calendar = google.calendar({ version: "v3", auth: authed.client });

  const requestBody: calendar_v3.Schema$Event = {
    summary: params.title,
    description: params.description ?? undefined,
    start: { dateTime: params.startsAt.toISOString(), timeZone: params.timezone },
    end: { dateTime: params.endsAt.toISOString(), timeZone: params.timezone },
    attendees: params.attendees.map((a) => ({
      email: a.email,
      displayName: a.name ?? undefined,
    })),
    conferenceData: {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: params.inviteeSendUpdates ? "all" : "none",
      requestBody,
    });
    const ev = res.data;
    const entry = ev.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    );
    return {
      eventId: ev.id ?? "",
      htmlLink: ev.htmlLink ?? null,
      meetLink: entry?.uri ?? null,
      conferenceId: ev.conferenceData?.conferenceId ?? null,
      calendarId: "primary",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google] calendar insert failed", err);
    return null;
  }
}

export async function patchCalendarEvent(params: {
  hostUserId: string;
  eventId: string;
  calendarId?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  title?: string;
  description?: string | null;
}): Promise<{ meetLink: string | null; conferenceId: string | null } | null> {
  const authed = await getClientForUser(params.hostUserId);
  if (!authed) return null;
  const calendar = google.calendar({ version: "v3", auth: authed.client });
  try {
    const res = await calendar.events.patch({
      calendarId: params.calendarId ?? "primary",
      eventId: params.eventId,
      sendUpdates: "all",
      requestBody: {
        summary: params.title,
        description: params.description ?? undefined,
        start: { dateTime: params.startsAt.toISOString(), timeZone: params.timezone },
        end: { dateTime: params.endsAt.toISOString(), timeZone: params.timezone },
      },
    });
    const ev = res.data;
    const entry = ev.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    );
    return {
      meetLink: entry?.uri ?? null,
      conferenceId: ev.conferenceData?.conferenceId ?? null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google] calendar patch failed", err);
    return null;
  }
}

export async function cancelCalendarEvent(params: {
  hostUserId: string;
  eventId: string;
  calendarId?: string;
}): Promise<boolean> {
  const authed = await getClientForUser(params.hostUserId);
  if (!authed) return false;
  const calendar = google.calendar({ version: "v3", auth: authed.client });
  try {
    await calendar.events.delete({
      calendarId: params.calendarId ?? "primary",
      eventId: params.eventId,
      sendUpdates: "all",
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google] calendar delete failed", err);
    return false;
  }
}

export type BusyInterval = { start: Date; end: Date };

export async function freeBusy(params: {
  hostUserId: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<BusyInterval[]> {
  const authed = await getClientForUser(params.hostUserId);
  if (!authed) return [];
  const calendar = google.calendar({ version: "v3", auth: authed.client });
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: params.timeMin.toISOString(),
        timeMax: params.timeMax.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busy = res.data.calendars?.["primary"]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({
        start: new Date(b.start as string),
        end: new Date(b.end as string),
      }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google] freebusy failed", err);
    return [];
  }
}

export async function upsertGoogleAccount(params: {
  userId: string;
  googleSub: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  scope: string;
}) {
  const refreshTokenEnc = sealBox(params.refreshToken);
  const existing = await db.googleAccount.findUnique({
    where: { userId: params.userId },
  });
  if (existing) {
    return db.googleAccount.update({
      where: { userId: params.userId },
      data: {
        googleSub: params.googleSub,
        email: params.email,
        accessToken: params.accessToken,
        refreshTokenEnc,
        accessTokenExpiresAt: params.accessTokenExpiresAt,
        scope: params.scope,
      },
    });
  }
  return db.googleAccount.create({
    data: {
      userId: params.userId,
      googleSub: params.googleSub,
      email: params.email,
      accessToken: params.accessToken,
      refreshTokenEnc,
      accessTokenExpiresAt: params.accessTokenExpiresAt,
      scope: params.scope,
    },
  });
}

export async function revokeAndDeleteGoogleAccount(userId: string) {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return;
  try {
    const refreshToken = openBox(row.refreshTokenEnc);
    // Fire-and-forget revoke.
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
    }).catch(() => {});
  } catch {
    // ignore decryption errors here — we still want to clean up
  }
  await db.googleAccount.delete({ where: { userId } });
}
