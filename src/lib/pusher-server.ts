/**
 * Server-side Pusher singleton (M15).
 *
 * Returns null gracefully when any required env var is absent — callers must
 * guard: `const p = getPusherServer(); if (p) await p.trigger(...)`.
 */
import Pusher from "pusher";

let _instance: Pusher | null | undefined = undefined; // undefined = not yet initialised

export function getPusherServer(): Pusher | null {
  if (_instance !== undefined) return _instance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_APP_KEY;
  const secret = process.env.PUSHER_APP_SECRET;
  const cluster = process.env.PUSHER_APP_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    _instance = null;
    return null;
  }

  try {
    _instance = new Pusher({ appId, key, secret, cluster, useTLS: true });
  } catch {
    _instance = null;
  }
  return _instance;
}
