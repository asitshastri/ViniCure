"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { ButtonLink } from "@/components/ui/button";
import { joinConsultation, type JoinOutcome } from "@/lib/data/consultation-api";
import type { Appointment } from "@/lib/types";
import { createVideoClient, VideoJoinError, type VideoClient } from "@/lib/video";
import { ConsentStep } from "./consent-step";
import { EndFeedback } from "./end-feedback";
import { JoinProblem, type ProblemKind } from "./join-problem";
import { Lobby } from "./lobby";
import { LiveCall } from "./live-call";
import { WaitingRoom } from "./waiting-room";

type Stage = "lobby" | "joining" | "consent" | "problem" | "waiting" | "live" | "ended";

/** How long a round trip to our own server may take before the connection is called weak. */
const WEAK_MS = 1500;

async function testNetwork(): Promise<"good" | "weak"> {
  const started = performance.now();
  try {
    const response = await fetch("/api/health", { cache: "no-store", credentials: "same-origin" });
    await response.arrayBuffer();
    return performance.now() - started > WEAK_MS ? "weak" : "good";
  } catch {
    return "weak";
  }
}

/**
 * The patient's way into a video consultation. With `real` the server decides (consent, payment,
 * time window) and a video client carries the call; without it the same screens run on sample data.
 */
export function CallFlow({
  appt,
  weakNetwork,
  real = false,
}: {
  appt: Appointment;
  weakNetwork: boolean;
  real?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("lobby");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<{ kind: ProblemKind; message?: string } | null>(null);
  const [client, setClient] = useState<VideoClient | null>(null);
  const [remotePresent, setRemotePresent] = useState(false);
  const [endedByDoctor, setEndedByDoctor] = useState(false);
  const clientRef = useRef<VideoClient | null>(null);
  const attempt = useRef(0);

  // Move focus to the new screen's heading, so keyboard and screen reader users start in the right place.
  useEffect(() => {
    document.getElementById("stage-h")?.focus();
  }, [stage]);

  // Leaving the page by any route releases the camera and microphone.
  useEffect(
    () => () => {
      void clientRef.current?.leave();
    },
    [],
  );

  const joined = useCallback(() => setStage("live"), []);

  const leaveClient = useCallback(async () => {
    const c = clientRef.current;
    clientRef.current = null;
    setClient(null);
    setRemotePresent(false);
    await c?.leave();
  }, []);

  const showProblem = useCallback(
    async (kind: ProblemKind, message?: string) => {
      await leaveClient();
      setProblem({ kind, ...(message ? { message } : {}) });
      setStage("problem");
    },
    [leaveClient],
  );

  /** Asks the server to let us in, then connects the video client. */
  const startJoin = useCallback(
    async (audio: boolean) => {
      const mine = ++attempt.current;
      setStage("joining");
      let outcome: JoinOutcome;
      try {
        outcome = await joinConsultation(appt.id);
      } catch {
        return showProblem("error");
      }
      if (mine !== attempt.current) return;
      if (outcome.status === "consent_required") return setStage("consent");
      if (outcome.status === "signin") {
        router.push(`/login?next=${encodeURIComponent(`/consultation/${appt.id}/lobby`)}`);
        return;
      }
      if (outcome.status !== "ok") {
        const kind: ProblemKind =
          outcome.status === "outside_window"
            ? "outside_window"
            : outcome.status === "not_paid"
              ? "not_paid"
              : outcome.status === "step_up"
                ? "step_up"
                : outcome.status === "not_open"
                  ? "not_open"
                  : outcome.status === "ended"
                    ? "ended"
                    : outcome.status === "not_found"
                      ? "not_found"
                      : outcome.status === "unavailable"
                        ? "unavailable"
                        : "error";
        return showProblem(kind, outcome.status === "not_open" ? outcome.message : undefined);
      }
      try {
        const video = await createVideoClient(outcome.credentials.appId);
        if (mine !== attempt.current) return void video.leave();
        clientRef.current = video;
        video.on("remote-joined", () => setRemotePresent(true));
        video.on("remote-left", () => setRemotePresent(false));
        await video.join(outcome.credentials, { video: !audio });
        if (mine !== attempt.current) return void video.leave();
        setClient(video);
        setStage("waiting");
      } catch (error) {
        if (mine !== attempt.current) return;
        return showProblem(
          error instanceof VideoJoinError && error.kind !== "unknown" ? error.kind : "error",
        );
      }
    },
    [appt.id, showProblem, router],
  );

  if (appt.status !== "upcoming") {
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
        <Notice tone="warning" title="This consultation is not open">
          It has finished or was cancelled. Look at your appointments for what to do next.
        </Notice>
        <div>
          <ButtonLink href="/patient/appointments">Go to appointments</ButtonLink>
        </div>
      </div>
    );
  }
  if (stage === "lobby") {
    return (
      <Lobby
        appt={appt}
        weakNetwork={weakNetwork}
        {...(real ? { testNetwork } : {})}
        onJoin={({ stream: s, audioOnly: a }) => {
          setAudioOnly(a);
          if (real) {
            // The video client opens its own camera and microphone; free the check's first.
            s?.getTracks().forEach((t) => t.stop());
            void startJoin(a);
            return;
          }
          setStream(s);
          setStage("waiting");
        }}
      />
    );
  }
  if (stage === "joining") {
    return (
      <div role="status" className="mx-auto grid max-w-xl gap-3 px-4 py-24 text-center">
        <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
          Joining…
        </h1>
        <p className="text-ink-muted text-lg">Connecting you securely. Please stay on this page.</p>
      </div>
    );
  }
  if (stage === "consent") {
    return (
      <ConsentStep
        appointmentId={appt.id}
        onDone={() => void startJoin(audioOnly)}
        onBack={() => setStage("lobby")}
      />
    );
  }
  if (stage === "problem" && problem) {
    return (
      <JoinProblem
        kind={problem.kind}
        {...(problem.message ? { message: problem.message } : {})}
        onRetry={() => setStage("lobby")}
      />
    );
  }
  if (stage === "waiting") {
    return (
      <WaitingRoom
        appt={appt}
        real={real}
        remotePresent={remotePresent}
        onDoctorJoined={joined}
        onLeave={() => {
          attempt.current++;
          void leaveClient();
          setStage("lobby");
        }}
      />
    );
  }
  if (stage === "live") {
    return (
      <LiveCall
        appt={appt}
        stream={stream}
        startAudioOnly={audioOnly}
        {...(real && client
          ? {
              real: {
                client,
                appointmentId: appt.id,
                onRejoin: () => {
                  void leaveClient().then(() => startJoin(audioOnly));
                },
                onEndedByServer: () => {
                  setEndedByDoctor(true);
                  void leaveClient();
                  setStage("ended");
                },
              },
            }
          : {})}
        onEnd={(s) => {
          setSeconds(s);
          stream?.getTracks().forEach((t) => t.stop());
          void leaveClient();
          setStage("ended");
        }}
      />
    );
  }
  if (real) {
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
        <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
          {endedByDoctor ? "Your doctor ended the consultation" : "You left the call"}
        </h1>
        <Notice tone="info" title="What happens next">
          {endedByDoctor
            ? "Thank you for your time. Anything your doctor shares appears in your records."
            : "If the consultation is still open you can rejoin from your appointments."}
        </Notice>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/patient/appointments">Go to appointments</ButtonLink>
        </div>
      </div>
    );
  }
  return <EndFeedback appt={appt} seconds={seconds} />;
}
