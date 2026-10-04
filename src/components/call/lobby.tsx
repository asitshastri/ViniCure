"use client";

import { useState } from "react";
import {
  CheckCircle,
  Circle,
  CircleNotch,
  Microphone,
  VideoCamera,
  WarningCircle,
  WifiHigh,
} from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { Appointment } from "@/lib/types";
import { PermissionHelp } from "./permission-help";
import { useMediaCheck, type DeviceState } from "./use-media-check";
import { VideoTile } from "./video-tile";

type Net = "idle" | "testing" | "good" | "weak";
type Props = {
  appt: Appointment;
  weakNetwork: boolean;
  onJoin: (opts: { stream: MediaStream | null; audioOnly: boolean }) => void;
  /** A real connection test. The sample screens fake one with a short wait. */
  testNetwork?: () => Promise<"good" | "weak">;
};

function StatusLine({
  icon: Icon,
  label,
  state,
  okText,
  badText,
}: {
  icon: typeof Microphone;
  label: string;
  state: DeviceState | Net;
  okText: string;
  badText: string;
}) {
  const ok = state === "ok" || state === "good";
  const bad = state === "denied" || state === "missing" || state === "error" || state === "weak";
  const busy = state === "checking" || state === "testing";
  const Status = busy ? CircleNotch : ok ? CheckCircle : bad ? WarningCircle : Circle;
  return (
    <li className="flex items-center gap-3">
      <Icon aria-hidden className="text-primary size-6 shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium",
          ok && "text-success",
          bad && "text-danger",
          !ok && !bad && "text-ink-muted",
        )}
      >
        <Status
          aria-hidden
          weight={ok || bad ? "fill" : "regular"}
          className={cn("size-5", busy && "animate-spin")}
        />
        {busy ? "Checking" : ok ? okText : bad ? badText : "Not checked yet"}
      </span>
    </li>
  );
}

export function Lobby({ appt, weakNetwork, onJoin, testNetwork }: Props) {
  const media = useMediaCheck();
  const [net, setNet] = useState<Net>("idle");
  const [audioOnly, setAudioOnly] = useState(false);

  async function runChecks() {
    setNet("testing");
    void media.start();
    if (testNetwork) return setNet(await testNetwork());
    await new Promise((r) => setTimeout(r, 1600));
    setNet(weakNetwork ? "weak" : "good");
  }

  const checked = media.mic !== "idle";
  const micOk = media.mic === "ok";
  const blocked = media.mic === "denied" || media.camera === "denied";
  const canJoin = micOk && net !== "idle" && net !== "testing";
  const useAudioOnly = audioOnly || net === "weak" || media.camera !== "ok";

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Get ready to join</h1>
          <p className="text-ink-muted mt-2 text-lg">
            {appt.doctorName}, {formatSlotDay(appt.date)} at {formatSlotTime(appt.time)} IST. Reg.{" "}
            {appt.registrationNumber}.
          </p>
        </div>

        <VideoTile
          name={appt.forWhom.split(" (")[0] ?? "You"}
          stream={media.stream}
          videoOn={media.camera === "ok"}
          label="You"
          className="aspect-video max-h-80 w-full max-w-xl"
        />

        <section
          aria-labelledby="checks-h"
          className="border-line bg-surface shadow-card grid gap-4 rounded-xl border p-5"
        >
          <h2 id="checks-h" className="text-xl font-semibold">
            Quick check
          </h2>
          <ul className="grid gap-3">
            <StatusLine
              icon={VideoCamera}
              label="Camera"
              state={media.camera}
              okText="Working"
              badText={
                media.camera === "denied"
                  ? "Blocked"
                  : media.camera === "missing"
                    ? "Not found"
                    : "Problem"
              }
            />
            <StatusLine
              icon={Microphone}
              label="Microphone"
              state={media.mic}
              okText="Working"
              badText={
                media.mic === "denied"
                  ? "Blocked"
                  : media.mic === "missing"
                    ? "Not found"
                    : "Problem"
              }
            />
            <StatusLine
              icon={WifiHigh}
              label="Connection"
              state={net}
              okText="Good"
              badText="Weak"
            />
          </ul>
          {micOk ? (
            <div>
              <p id="mic-l" className="mb-1 text-sm font-medium">
                Say something to see your microphone move
              </p>
              <div
                role="meter"
                aria-labelledby="mic-l"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(media.level * 100)}
                className="bg-line h-3 overflow-hidden rounded-full"
              >
                <div
                  className="bg-success h-full"
                  style={{ width: `${Math.round(media.level * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          {net === "weak" ? (
            <Notice tone="warning" title="Your connection looks weak">
              Video may freeze. We suggest joining with audio only. Your doctor can still see your
              records.
            </Notice>
          ) : null}
          <div>
            <Button
              variant={checked ? "secondary" : "primary"}
              size="lg"
              onClick={() => void runChecks()}
              loading={media.mic === "checking" || net === "testing"}
            >
              {checked ? "Check again" : "Check my camera and microphone"}
            </Button>
            {!checked ? (
              <p className="text-ink-muted mt-2 text-sm">
                Your browser will ask for permission. Nothing is recorded.
              </p>
            ) : null}
          </div>
        </section>

        {blocked || media.mic === "missing" || media.mic === "error" ? (
          <PermissionHelp kind={blocked ? "blocked" : "missing"} />
        ) : null}
      </div>

      <aside
        aria-label="Join"
        className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start"
      >
        <div className="border-line bg-surface shadow-card grid gap-4 rounded-xl border p-5">
          {media.camera !== "ok" && micOk ? (
            <p className="text-ink-muted text-sm">
              No camera available. You will join with audio only.
            </p>
          ) : null}
          {media.camera === "ok" ? (
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="accent-primary mt-1 size-5"
                checked={useAudioOnly}
                disabled={net === "weak"}
                onChange={(e) => setAudioOnly(e.target.checked)}
              />
              <span>
                Join with audio only
                <span className="text-ink-muted block text-sm">
                  Uses less data. You can turn the camera on later.
                </span>
              </span>
            </label>
          ) : null}
          <Button
            size="lg"
            disabled={!canJoin}
            aria-describedby="join-hint"
            onClick={() => onJoin({ stream: media.stream, audioOnly: useAudioOnly })}
          >
            Join the waiting room
          </Button>
          <p id="join-hint" className="text-ink-muted text-sm">
            {canJoin
              ? "The doctor will let you in when ready."
              : "Run the quick check first. You need a working microphone."}
          </p>
        </div>
        <p className="text-ink-muted text-sm">
          Recording is off. It happens only if you and your doctor both agree.{" "}
          {testNetwork
            ? "Before your first call you will be asked to agree to the consultation terms."
            : "By joining you accept the consultation terms (draft, pending legal review)."}
        </p>
      </aside>
    </div>
  );
}
