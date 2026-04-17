"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onRecorded: (blob: Blob, durationSec: number) => void;
  onClear: () => void;
  disabled?: boolean;
};

type RecorderState = "idle" | "recording" | "recorded";

const MAX_DURATION_SEC = 120;

export function VoiceRecorder({ onRecorded, onClear, disabled }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      stopTracks();
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : undefined;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const duration = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        const blob = new Blob(chunksRef.current, {
          type: mimeType ?? recorder.mimeType ?? "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setState("recorded");
        stopTracks();
        onRecorded(blob, duration);
      };

      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setState("recording");

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_DURATION_SEC) stopRecording();
      }, 250);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to access microphone",
      );
      stopTracks();
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function clearRecording() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setElapsed(0);
    setState("idle");
    chunksRef.current = [];
    onClear();
  }

  if (state === "idle") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startRecording}
          disabled={disabled}
          aria-label="Record voice note"
        >
          <Mic className="h-4 w-4" />
        </Button>
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
        />
        <span className="text-xs tabular-nums text-muted-foreground">
          {elapsed}s / {MAX_DURATION_SEC}s
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={stopRecording}
          disabled={disabled}
          aria-label="Stop recording"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // recorded
  return (
    <div className="flex items-center gap-2">
      {blobUrl ? (
        <audio controls src={blobUrl} className="h-9 max-w-full" />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={clearRecording}
        disabled={disabled}
        aria-label="Delete recording"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground">Ready to send</span>
    </div>
  );
}
