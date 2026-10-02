"use client";

import { useEffect, useState } from "react";
import {
  CellSignalFull,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  VideoCamera,
  VideoCameraSlash,
} from "@phosphor-icons/react/ssr";
import { VideoTile } from "@/components/call/video-tile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

type Props = { patientName: string; doctorName: string; onEnd: () => void; compact?: boolean };

/** Mock video area. The real video arrives with P6-06 and P6-07. */
export function VideoPane({ patientName, doctorName, onEnd }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ctrl =
    "flex size-12 items-center justify-center rounded-full border border-white/40 transition-colors";
  return (
    <div className="on-dark bg-dock grid gap-3 rounded-2xl p-3 text-white">
      <div className="relative">
        <VideoTile
          name={patientName}
          videoOn={false}
          label={patientName}
          className="aspect-[4/3] max-h-[50dvh] w-full sm:aspect-video"
        />
        <VideoTile
          name={doctorName}
          videoOn={false}
          muted={!mic}
          label="You"
          size="sm"
          className="absolute right-3 bottom-3 aspect-[3/4] w-20 border-2 border-white/60 sm:aspect-video sm:w-36"
        />
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm">
          <CellSignalFull aria-hidden weight="fill" className="size-4" />
          Secure. Excellent
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-sm tabular-nums">
          <span className="sr-only">Time on call: </span>
          {fmt(seconds)}
        </span>
      </div>
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
        <Button variant="danger" size="lg" onClick={onEnd}>
          <PhoneDisconnect aria-hidden weight="fill" className="size-5" /> End
          <span className="sr-only"> consultation</span>
        </Button>
      </div>
    </div>
  );
}
