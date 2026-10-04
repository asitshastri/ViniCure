"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CellSignalFull,
  CellSignalLow,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  VideoCamera,
  VideoCameraSlash,
  WifiSlash,
} from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { useRealCall } from "@/components/call/use-real-call";
import { VideoTile } from "@/components/call/video-tile";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { endConsultation, joinConsultation } from "@/lib/data/consultation-api";
import { createVideoClient, VideoJoinError, type VideoClient } from "@/lib/video";

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

type Props = {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  /** Inside the join window. The server decides again when the doctor presses start. */
  canStart: boolean;
  onEnded: () => void;
};

type Phase = "idle" | "joining" | "live";

const PROBLEMS: Record<string, string> = {
  outside_window:
    "It is not time to start yet. You can start a few minutes before the booked time and until a little after it ends.",
  not_paid: "This booking is not paid, so the call cannot start.",
  not_open: "This consultation is closed.",
  ended: "This consultation has already ended.",
  unavailable: "Video is not available right now. Try again in a moment.",
  permission: "Allow the microphone for this site, then try again.",
  device: "No microphone was found. Connect one and try again.",
  network: "We could not reach the video service. Check your network and try again.",
  token: "The video service did not accept the entry. Try again.",
  error: "We could not start the call. Check your connection and try again.",
};

/**
 * The doctor's video (P6-07): starts the call on demand (the browser asks for the camera then),
 * shows the patient and the doctor's own picture, keeps the token fresh, and ends the consultation
 * for both people when the doctor says so.
 */
export function RealVideoPane({
  appointmentId,
  patientName,
  doctorName,
  canStart,
  onEnded,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [client, setClient] = useState<VideoClient | null>(null);
  const clientRef = useRef<VideoClient | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(
    () => () => {
      void clientRef.current?.leave();
    },
    [],
  );
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const finished = useCallback(() => {
    const c = clientRef.current;
    clientRef.current = null;
    setClient(null);
    void c?.leave();
    onEnded();
  }, [onEnded]);

  async function start() {
    setPhase("joining");
    setProblem(null);
    const outcome = await joinConsultation(appointmentId).catch(() => null);
    if (!outcome || outcome.status !== "ok") {
      setPhase("idle");
      return setProblem(PROBLEMS[outcome?.status ?? "error"] ?? PROBLEMS.error ?? "");
    }
    try {
      const video = await createVideoClient(outcome.credentials.appId);
      clientRef.current = video;
      await video.join(outcome.credentials, { video: true });
      setClient(video);
      setMic(true);
      setCam(true);
      setSeconds(0);
      setPhase("live");
    } catch (error) {
      void clientRef.current?.leave();
      clientRef.current = null;
      setPhase("idle");
      const kind = error instanceof VideoJoinError ? error.kind : "error";
      setProblem(PROBLEMS[kind === "unknown" ? "error" : kind] ?? PROBLEMS.error ?? "");
    }
  }

  async function end() {
    setEnding(true);
    const result = await endConsultation(appointmentId);
    setEnding(false);
    if (result.status === "error") {
      setConfirmEnd(false);
      return setProblem("We could not end the consultation. Try again.");
    }
    setConfirmEnd(false);
    finished();
  }

  const call = useRealCall(
    client ? { client, appointmentId, onEndedByServer: finished } : undefined,
  );

  useEffect(() => {
    if (client) void client.setMicrophone(mic);
  }, [mic, client]);
  const bump = call.bump;
  useEffect(() => {
    if (client) void client.setCamera(cam).then(bump);
  }, [cam, client, bump]);

  const ctrl =
    "flex size-12 items-center justify-center rounded-full border border-white/40 transition-colors";

  if (phase !== "live") {
    return (
      <div className="on-dark bg-dock grid gap-4 rounded-2xl p-6 text-white">
        <p className="text-xl font-semibold">
          {phase === "joining" ? "Starting the call…" : `Consultation with ${patientName}`}
        </p>
        <p className="text-white/80">
          {phase === "joining"
            ? "Connecting securely. Your browser may ask for the camera and microphone."
            : canStart
              ? "Everything is ready. The patient will see you as soon as you start."
              : "The call can be started a few minutes before the booked time."}
        </p>
        {problem ? (
          <p role="alert" className="rounded-xl bg-white/10 p-3">
            {problem}
          </p>
        ) : null}
        <div>
          <Button
            size="lg"
            variant="dock"
            loading={phase === "joining"}
            disabled={!canStart}
            onClick={() => void start()}
          >
            Start the call
          </Button>
        </div>
      </div>
    );
  }

  const remote = client?.remoteStream ?? null;
  const remoteVideo = Boolean(remote?.getVideoTracks().some((t) => t.readyState === "live"));
  const conn = call.conn;
  const ConnIcon = conn === "good" ? CellSignalFull : conn === "weak" ? CellSignalLow : WifiSlash;

  return (
    <div className="on-dark bg-dock grid gap-3 rounded-2xl p-3 text-white">
      <div className="relative">
        <VideoTile
          name={patientName}
          stream={remote}
          remote
          videoOn={remoteVideo}
          label={patientName}
          className="aspect-[4/3] max-h-[50dvh] w-full sm:aspect-video"
        />
        <VideoTile
          name={doctorName}
          stream={client?.localStream ?? null}
          videoOn={cam && Boolean(client?.localStream)}
          muted={!mic}
          label="You"
          size="sm"
          className="absolute right-3 bottom-3 aspect-[3/4] w-20 border-2 border-white/60 sm:aspect-video sm:w-36"
        />
        <span
          className={cn(
            "absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
            conn === "good"
              ? "bg-black/60"
              : conn === "weak"
                ? "bg-warning-soft text-warning"
                : "bg-danger-soft text-danger",
          )}
        >
          <ConnIcon aria-hidden weight="fill" className="size-4" />
          {conn === "good"
            ? "Connection good"
            : conn === "weak"
              ? "Connection weak"
              : conn === "reconnecting"
                ? "Reconnecting"
                : "Disconnected"}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-sm tabular-nums">
          <span className="sr-only">Time on call: </span>
          {fmt(seconds)}
        </span>
        {conn === "reconnecting" || conn === "failed" ? (
          <div
            role="alert"
            className="bg-dock/90 absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center"
          >
            <p className="text-xl font-semibold">
              {conn === "reconnecting" ? "Reconnecting…" : "We lost the connection"}
            </p>
            {conn === "failed" ? (
              <Button
                variant="dock"
                onClick={() => {
                  const c = clientRef.current;
                  clientRef.current = null;
                  setClient(null);
                  void c?.leave().then(() => start());
                }}
              >
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {call.remoteLeft ? (
        <p role="status" className="rounded-xl bg-white/10 p-3 text-center">
          {patientName} has left the call. They can come back while the consultation is open.
        </p>
      ) : null}
      {call.renewalProblem ? (
        <p role="alert" className="rounded-xl bg-white/10 p-3 text-center">
          We are having trouble keeping the call secure. Stay on this page; we are trying again.
        </p>
      ) : null}
      {problem ? (
        <Notice tone="danger" title="Not ended">
          {problem}
        </Notice>
      ) : null}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          aria-pressed={!mic}
          aria-label={mic ? "Mute microphone" : "Unmute microphone"}
          onClick={() => setMic((v) => !v)}
          className={cn(ctrl, mic ? "bg-white/10 hover:bg-white/20" : "text-dock bg-white")}
        >
          {mic ? (
            <Microphone aria-hidden className="size-6" />
          ) : (
            <MicrophoneSlash aria-hidden weight="fill" className="size-6" />
          )}
        </button>
        <button
          type="button"
          aria-pressed={!cam}
          aria-label={cam ? "Turn camera off" : "Turn camera on"}
          onClick={() => setCam((v) => !v)}
          className={cn(ctrl, cam ? "bg-white/10 hover:bg-white/20" : "text-dock bg-white")}
        >
          {cam ? (
            <VideoCamera aria-hidden className="size-6" />
          ) : (
            <VideoCameraSlash aria-hidden weight="fill" className="size-6" />
          )}
        </button>
        <Button variant="danger" size="lg" onClick={() => setConfirmEnd(true)}>
          <PhoneDisconnect aria-hidden weight="fill" className="size-5" /> End
          <span className="sr-only"> consultation</span>
        </Button>
      </div>
      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End this consultation for everyone?"
        description="The patient is disconnected and cannot rejoin. Anything you have not saved is lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Stay on the call
            </Button>
            <Button variant="danger" loading={ending} onClick={() => void end()}>
              End consultation
            </Button>
          </>
        }
      />
    </div>
  );
}
