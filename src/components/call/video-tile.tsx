"use client";

import { useEffect, useRef } from "react";
import { MicrophoneSlash } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  /** A live local stream for the person's own tile. The doctor's tile is a placeholder until P6. */
  stream?: MediaStream | null;
  videoOn: boolean;
  muted?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "lg";
};

/** Shows the video when it is on, and a round avatar when it is off, like the call reference. */
export function VideoTile({
  name,
  stream,
  videoOn,
  muted = false,
  label,
  className,
  size = "lg",
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream, videoOn]);
  const showVideo = videoOn && stream && stream.getVideoTracks().length > 0;
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-700",
        className,
      )}
    >
      {showVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          aria-label={`${name}, video`}
          className="size-full -scale-x-100 object-cover"
        />
      ) : (
        <Avatar
          name={name}
          size={size === "lg" ? "xl" : "lg"}
          className={size === "lg" ? "!size-28 !text-4xl" : ""}
        />
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
        {muted ? <MicrophoneSlash aria-hidden weight="fill" className="size-4" /> : null}
        {label ?? name}
        {muted ? <span className="sr-only"> (muted)</span> : null}
      </span>
    </div>
  );
}
