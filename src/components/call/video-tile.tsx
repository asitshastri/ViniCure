"use client";

import { useEffect, useRef } from "react";
import { MicrophoneSlash } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  /** The picture to show: the person's own camera, or (with `remote`) the other person's audio and video. */
  stream?: MediaStream | null;
  /** The other person's tile: sound on, not mirrored. Your own tile is muted and mirrored. */
  remote?: boolean;
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
  remote = false,
  label,
  className,
  size = "lg",
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const showVideo = videoOn && stream && stream.getVideoTracks().length > 0;
  // The other person's voice plays through a video element, which stays in the page even while
  // their camera is off (audio-only), so the sound is never lost with the picture.
  const playRemoteAudio = remote && stream && stream.getAudioTracks().length > 0;
  const active = Boolean(showVideo || playRemoteAudio);
  // The element exists only while there is something to play, so attach the stream when it appears.
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream, active]);
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-700",
        className,
      )}
    >
      {showVideo || playRemoteAudio ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={!remote}
          aria-label={`${name}, video`}
          className={cn(
            "size-full object-cover",
            !remote && "-scale-x-100",
            !showVideo && "absolute inset-0 opacity-0",
          )}
        />
      ) : null}
      {!showVideo ? (
        <Avatar
          name={name}
          size={size === "lg" ? "xl" : "lg"}
          className={size === "lg" ? "!size-28 !text-4xl" : ""}
        />
      ) : null}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
        {muted ? <MicrophoneSlash aria-hidden weight="fill" className="size-4" /> : null}
        {label ?? name}
        {muted ? <span className="sr-only"> (muted)</span> : null}
      </span>
    </div>
  );
}
