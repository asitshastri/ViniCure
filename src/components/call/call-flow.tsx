"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { ButtonLink } from "@/components/ui/button";
import type { Appointment } from "@/lib/types";
import { EndFeedback } from "./end-feedback";
import { Lobby } from "./lobby";
import { LiveCall } from "./live-call";
import { WaitingRoom } from "./waiting-room";

type Stage = "lobby" | "waiting" | "live" | "ended";

export function CallFlow({ appt, weakNetwork }: { appt: Appointment; weakNetwork: boolean }) {
  const [stage, setStage] = useState<Stage>("lobby");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Move focus to the new screen's heading, so keyboard and screen reader users start in the right place.
  useEffect(() => {
    document.getElementById("stage-h")?.focus();
  }, [stage]);

  const joined = useCallback(() => setStage("live"), []);

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
        onJoin={({ stream: s, audioOnly: a }) => {
          setStream(s);
          setAudioOnly(a);
          setStage("waiting");
        }}
      />
    );
  }
  if (stage === "waiting")
    return <WaitingRoom appt={appt} onDoctorJoined={joined} onLeave={() => setStage("lobby")} />;
  if (stage === "live")
    return (
      <LiveCall
        appt={appt}
        stream={stream}
        startAudioOnly={audioOnly}
        onEnd={(s) => {
          setSeconds(s);
          stream?.getTracks().forEach((t) => t.stop());
          setStage("ended");
        }}
      />
    );
  return <EndFeedback appt={appt} seconds={seconds} />;
}
