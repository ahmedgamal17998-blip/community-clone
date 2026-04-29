"use client";

/**
 * ChatVoiceMic — push-to-record mic button inside the chat composer.
 *
 * UX:
 *   1. Idle    — solid primary circle with a Mic icon. Click to start.
 *   2. Recording — pulsing red dot + elapsed timer + Send (✓) and Cancel (✕)
 *      buttons. Capped at 120s; auto-stops past that.
 *   3. Sending — disabled state while uploading + dispatching the message.
 *
 * On send: uploads the blob to /api/comment-audio/upload and calls
 * `onSend({ url, mediaType, durationSec })`. The parent threads it into
 * the existing send-message flow.
 */

import { useEffect, useRef, useState } from "react";
import { Mic, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_DURATION_SEC = 120;

type Props = {
  onSend: (audio: { url: string; mediaType: string; durationSec: number }) => Promise<void> | void;
  disabled?: boolean;
};

type State = "idle" | "recording" | "sending";

export function ChatVoiceMic({ onSend, disabled }: Props) {
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("Microphone not supported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // If the user cancelled, drop the blob and return to idle.
        if (cancelledRef.current) {
          stopTracks();
          chunksRef.current = [];
          setState("idle");
          setElapsed(0);
          return;
        }
        const duration = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        const blob = new Blob(chunksRef.current, {
          type: mimeType ?? recorder.mimeType ?? "audio/webm",
        });
        stopTracks();
        await uploadAndSend(blob, duration);
      };

      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setState("recording");

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_DURATION_SEC) finishAndSend();
      }, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to access microphone");
      stopTracks();
      setState("idle");
    }
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function finishAndSend() {
    clearTimer();
    cancelledRef.current = false;
    setState("sending");
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function cancelRecording() {
    clearTimer();
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopTracks();
      setState("idle");
      setElapsed(0);
    }
  }

  async function uploadAndSend(blob: Blob, durationSec: number) {
    try {
      const fd = new FormData();
      fd.set("file", blob, `voice-${Date.now()}.webm`);
      const res = await fetch("/api/comment-audio/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Upload failed");
      }
      const data = (await res.json()) as { url: string };
      await onSend({
        url: data.url,
        mediaType: "audio",
        durationSec,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send voice note");
    } finally {
      setState("idle");
      setElapsed(0);
      chunksRef.current = [];
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (state === "idle") {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {error ? (
          <span className="text-[11px] text-destructive">{error}</span>
        ) : null}
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          aria-label="Record voice message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(124,58,237,0.35)] transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
        >
          <Mic className="h-[18px] w-[18px]" />
        </button>
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/5 px-2 py-1">
        <span
          aria-hidden
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500"
        />
        <span className="text-[11px] tabular-nums text-red-600 dark:text-red-400">
          {String(Math.floor(elapsed / 60)).padStart(1, "0")}:
          {String(elapsed % 60).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={finishAndSend}
          aria-label="Send voice"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // sending
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Sending…</span>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    </div>
  );
}
