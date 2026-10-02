"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceState = "idle" | "checking" | "ok" | "denied" | "missing" | "error";

/**
 * Asks the browser for the camera and microphone only when the person presses a button, then shows a live preview
 * and a microphone level. Nothing is recorded or sent anywhere: the stream stays in this tab.
 */
export function useMediaCheck() {
  const [camera, setCamera] = useState<DeviceState>("idle");
  const [mic, setMic] = useState<DeviceState>("idle");
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    cleanup.current();
    cleanup.current = () => {};
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setLevel(0);
  }, []);

  useEffect(() => stop, [stop]);

  const classify = (e: unknown): DeviceState => {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
    return "error";
  };

  function meter(s: MediaStream) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC || s.getAudioTracks().length === 0) return;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(s);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      raf = requestAnimationFrame(tick);
    };
    tick();
    cleanup.current = () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }

  const start = useCallback(async () => {
    stop();
    setCamera("checking");
    setMic("checking");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setMic("error");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      setCamera(s.getVideoTracks().length ? "ok" : "missing");
      setMic(s.getAudioTracks().length ? "ok" : "missing");
      meter(s);
      return;
    } catch (e) {
      const first = classify(e);
      if (first === "denied") {
        setCamera("denied");
        setMic("denied");
        return;
      }
    }
    // Camera failed for another reason. Try the microphone alone, so the person can still join by audio.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(s);
      setCamera("missing");
      setMic("ok");
      meter(s);
    } catch (e) {
      setCamera("missing");
      setMic(classify(e));
    }
  }, [stop]);

  return { camera, mic, level, stream, start, stop };
}
