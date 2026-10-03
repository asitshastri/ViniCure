"use client";

import { useEffect, useRef, useState } from "react";
import {
  CellSignalFull,
  CellSignalLow,
  Info,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  SealCheck,
  VideoCamera,
  VideoCameraSlash,
  WifiSlash,
} from "@phosphor-icons/react/ssr";
import { PrototypeHint } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import type { Appointment } from "@/lib/types";
import { VideoTile } from "./video-tile";

type Conn = "good" | "weak" | "reconnecting" | "failed";
type Props = {
  appt: Appointment;
  stream: MediaStream | null;
  startAudioOnly: boolean;
  onEnd: (seconds: number) => void;
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function CtrlButton({
  on,
  onLabel,
  offLabel,
  onIcon: On,
  offIcon: Off,
  onClick,
  disabled,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onIcon: typeof Microphone;
  offIcon: typeof Microphone;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = on ? On : Off;
  return (
    <button
      type="button"
      aria-pressed={!on}
      aria-label={on ? onLabel : offLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-12 items-center justify-center rounded-full border border-white/40 text-white transition-colors disabled:opacity-40",
        on ? "bg-white/10 hover:bg-white/20" : "text-dock bg-white hover:bg-white/90",
      )}
    >
      <Icon
        aria-hidden
        weight={on ? "regular" : "fill"}
        className={cn("size-6", !on && "text-dock")}
      />
    </button>
  );
}

export function LiveCall({ appt, stream, startAudioOnly, onEnd }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(!startAudioOnly && Boolean(stream?.getVideoTracks().length));
  const [audioOnly, setAudioOnly] = useState(startAudioOnly);
  const [conn, setConn] = useState<Conn>("good");
  const [attempt, setAttempt] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [info, setInfo] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn, stream]);
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = camOn && !audioOnly));
  }, [camOn, audioOnly, stream]);

  // A plain function, so it can call itself for the next attempt.
  function reconnect(n: number) {
    setConn("reconnecting");
    setAttempt(n);
    const t = setTimeout(() => (n >= 3 ? setConn("failed") : reconnect(n + 1)), 3000);
    timers.current.push(t);
  }

  function retry() {
    timers.current.forEach(clearTimeout);
    setConn("reconnecting");
    setAttempt(1);
    timers.current.push(setTimeout(() => setConn("good"), 2500));
  }

  function goAudioOnly() {
    timers.current.forEach(clearTimeout);
    setAudioOnly(true);
    setCamOn(false);
    setConn("weak");
  }

  const selfName = appt.forWhom.split(" (")[0] ?? "You";
  const ConnIcon = conn === "good" ? CellSignalFull : conn === "weak" ? CellSignalLow : WifiSlash;

  return (
    <div className="on-dark bg-dock flex min-h-dvh flex-col text-white">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <h1 tabIndex={-1} id="stage-h" className="text-lg font-semibold outline-none">
          Consultation with {appt.doctorName}
        </h1>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
            conn === "good"
              ? "bg-success-soft text-success"
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
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm">
          Not recorded
        </span>
        <button
          type="button"
          onClick={() => setInfo((v) => !v)}
          aria-expanded={info}
          aria-controls="info-panel"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 lg:hidden"
        >
          <Info aria-hidden className="size-6" />
          <span className="sr-only">Consultation details</span>
        </button>
      </header>

      <div className="flex flex-1 gap-4 px-4 pb-4 sm:px-6">
        <div className="relative grid flex-1 content-center">
          <div className="relative">
            <VideoTile
              name={appt.doctorName}
              videoOn={false}
              label={appt.doctorName}
              className="aspect-[3/4] max-h-[62dvh] w-full sm:aspect-video"
            />
            <VideoTile
              name={selfName}
              stream={stream}
              videoOn={camOn && !audioOnly}
              muted={!micOn}
              label="You"
              size="sm"
              className="absolute right-3 bottom-3 aspect-[3/4] w-24 border-2 border-white/60 sm:aspect-video sm:w-40"
            />
            {audioOnly ? (
              <p className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm">
                Audio only
              </p>
            ) : null}
            {conn === "reconnecting" || conn === "failed" ? (
              <div
                role="alert"
                className="bg-dock/90 absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center"
              >
                {conn === "reconnecting" ? (
                  <>
                    <p className="text-xl font-semibold">Reconnecting… attempt {attempt} of 3</p>
                    <p className="text-white/80">
                      Please stay on this page. Your doctor will wait.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-semibold">We lost the connection</p>
                    <p className="text-white/80">
                      Check your network. You can try again, or continue by audio, which needs much
                      less data.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button onClick={retry} className="!text-dock bg-white hover:bg-white/90">
                        Try again
                      </Button>
                      <Button variant="dock" onClick={goAudioOnly}>
                        Continue with audio only
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
          <PrototypeHint dark>
            <p>Simulate:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="dock" size="sm" onClick={() => setConn("weak")}>
                Weak connection
              </Button>
              <Button variant="dock" size="sm" onClick={() => reconnect(1)}>
                Dropped connection
              </Button>
              <Button variant="dock" size="sm" onClick={() => setConn("good")}>
                Back to good
              </Button>
            </div>
          </PrototypeHint>
        </div>

        <aside
          id="info-panel"
          aria-label="Consultation details"
          className={cn(
            "w-72 shrink-0 gap-4 rounded-2xl bg-white/10 p-5 lg:grid lg:content-start",
            info ? "fixed inset-x-4 bottom-28 z-20 grid bg-slate-800" : "hidden",
          )}
        >
          <p className="font-display text-lg font-semibold">{appt.doctorName}</p>
          <p className="text-white/80">{appt.specialty}</p>
          <p className="flex items-center gap-1.5 text-sm text-white/90">
            <SealCheck aria-hidden weight="fill" className="size-4" />
            Reg. {appt.registrationNumber}
          </p>
          <hr className="border-white/20" />
          <p className="text-sm text-white/80">
            For {appt.forWhom}. Booking {appt.reference}.
          </p>
          <p className="text-sm text-white/80">
            Not for emergencies. If you feel very unwell, call 112.
          </p>
        </aside>
      </div>

      <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <p className="w-16 text-sm text-white/80 tabular-nums">
          <span className="sr-only">Time on call: </span>
          {fmt(seconds)}
        </p>
        <div className="flex flex-1 justify-center gap-3">
          <CtrlButton
            on={micOn}
            onLabel="Mute microphone"
            offLabel="Unmute microphone"
            onIcon={Microphone}
            offIcon={MicrophoneSlash}
            onClick={() => setMicOn((v) => !v)}
          />
          <CtrlButton
            on={camOn && !audioOnly}
            onLabel="Turn camera off"
            offLabel="Turn camera on"
            onIcon={VideoCamera}
            offIcon={VideoCameraSlash}
            disabled={!stream?.getVideoTracks().length || audioOnly}
            onClick={() => setCamOn((v) => !v)}
          />
          {!audioOnly ? (
            <Button variant="dock" className="hidden sm:inline-flex" onClick={goAudioOnly}>
              Switch to audio only
            </Button>
          ) : null}
        </div>
        <Button variant="danger" size="lg" onClick={() => setConfirmEnd(true)}>
          <PhoneDisconnect aria-hidden weight="fill" className="size-5" /> End
          <span className="sr-only"> consultation</span>
        </Button>
      </div>

      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End the consultation?"
        description="If you leave now, your doctor may not have finished. You can rejoin from your appointments while it is still open."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              Stay on the call
            </Button>
            <Button variant="danger" onClick={() => onEnd(seconds)}>
              End consultation
            </Button>
          </>
        }
      />
    </div>
  );
}
