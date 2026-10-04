"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renewToken } from "@/lib/data/consultation-api";
import type { VideoClient } from "@/lib/video";

export type Conn = "good" | "weak" | "reconnecting" | "failed";

const RENEW_RETRIES = 3;
const RENEW_RETRY_MS = 15_000;

/**
 * What a live call needs from the video client: the connection state, whether the other person is
 * still there, and keeping the token fresh. When the server says the consultation is over (it
 * refuses a new token), `onEndedByServer` runs once.
 */
export function useRealCall(
  real: { client: VideoClient; appointmentId: string; onEndedByServer: () => void } | undefined,
) {
  const [conn, setConn] = useState<Conn>("good");
  // Bumped when the other person's media or our own camera changes, so the screen redraws.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [remoteLeft, setRemoteLeft] = useState(false);
  const [renewalProblem, setRenewalProblem] = useState(false);
  const ended = useRef(false);
  const endedHandler = useRef<() => void>(() => {});
  const onEndedByServer = real?.onEndedByServer;
  useEffect(() => {
    endedHandler.current = onEndedByServer ?? (() => {});
  }, [onEndedByServer]);

  const client = real?.client;
  const appointmentId = real?.appointmentId;

  useEffect(() => {
    if (!client || !appointmentId) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function renew(attempt: number): Promise<void> {
      const result = await renewToken(appointmentId as string);
      if (!alive) return;
      if (result.status === "ok") {
        setRenewalProblem(false);
        await client?.renewToken(result.token);
        return;
      }
      if (result.status === "ended") {
        if (!ended.current) {
          ended.current = true;
          endedHandler.current();
        }
        return;
      }
      // A network hiccup: try again soon, a few times, and say so if it keeps failing.
      setRenewalProblem(true);
      if (attempt < RENEW_RETRIES)
        timers.push(setTimeout(() => void renew(attempt + 1), RENEW_RETRY_MS));
    }

    const off = [
      client.on("connection", (state) =>
        setConn((prev) =>
          state === "connected"
            ? prev === "weak"
              ? "weak"
              : "good"
            : state === "reconnecting"
              ? "reconnecting"
              : "failed",
        ),
      ),
      client.on("quality", (q) =>
        setConn((prev) =>
          prev === "reconnecting" || prev === "failed" ? prev : q === "good" ? "good" : "weak",
        ),
      ),
      client.on("remote-media", () => setVersion((v) => v + 1)),
      client.on("remote-joined", () => setRemoteLeft(false)),
      client.on("remote-left", () => {
        setRemoteLeft(true);
        setVersion((v) => v + 1);
      }),
      client.on("token-expiring", () => void renew(1)),
      client.on("token-expired", () => void renew(1)),
    ];
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      off.forEach((stop) => stop());
    };
  }, [client, appointmentId]);

  return {
    conn,
    setConn,
    version,
    bump,
    remoteLeft,
    renewalProblem,
  };
}
