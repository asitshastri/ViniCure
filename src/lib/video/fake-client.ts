import {
  Emitter,
  VideoJoinError,
  type JoinCredentials,
  type NetworkQuality,
  type VideoClient,
  type VideoEvents,
} from "./client";

// A stand-in video client for local work and the browser tests (P6-06). It opens the real camera
// and microphone (Chromium's fake devices in tests), "joins" at once, and shows a drawn picture
// for the other person a moment later. It exists only for the fake provider, which the server
// refuses in production, so it can never be reached by a real patient.

export type FakeVideoControls = {
  /** Loses the connection (the screen shows "Reconnecting"). */
  drop(): void;
  restore(): void;
  quality(level: NetworkQuality): void;
  remoteLeaves(): void;
  expireToken(): void;
  /** Tokens given to renewToken, so a test can see renewal happen. */
  renewals: string[];
};

declare global {
  interface Window {
    __fakeVideo?: FakeVideoControls;
  }
}

const REMOTE_DELAY_MS = 600;

export class FakeVideoClient implements VideoClient {
  private readonly events = new Emitter();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private left = false;
  private canvasTimer: ReturnType<typeof setInterval> | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  private audio: MediaStream | null = null;

  on<K extends keyof VideoEvents>(event: K, handler: (value: VideoEvents[K]) => void) {
    return this.events.on(event, handler);
  }

  private drawRemote() {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const paint = () => {
      if (!ctx) return;
      ctx.fillStyle = "#1f4d3f";
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px sans-serif";
      ctx.fillText("Doctor (test picture)", 40, 120);
      ctx.fillRect(40 + (frame % 200), 150, 20, 20);
      frame += 4;
    };
    paint();
    this.canvasTimer = setInterval(paint, 100);
    return canvas.captureStream(10);
  }

  async join(_credentials: JoinCredentials, media: { video: boolean }): Promise<void> {
    this.left = false;
    try {
      this.audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = (error as { name?: string }).name ?? "";
      throw new VideoJoinError(
        /NotAllowed|Permission/i.test(name) ? "permission" : "device",
        "no microphone",
        { cause: error },
      );
    }
    if (media.video) await this.openCamera();
    this.events.emit("connection", "connected");

    this.timer = setTimeout(() => {
      this.remoteStream = this.drawRemote();
      this.events.emit("remote-joined", undefined);
      this.events.emit("remote-media", undefined);
    }, REMOTE_DELAY_MS);

    const controls: FakeVideoControls = {
      drop: () => {
        this.events.emit("connection", "reconnecting");
      },
      restore: () => {
        this.events.emit("connection", "connected");
      },
      quality: (level) => this.events.emit("quality", level),
      remoteLeaves: () => {
        this.remoteStream = null;
        this.events.emit("remote-left", undefined);
      },
      expireToken: () => this.events.emit("token-expiring", undefined),
      renewals: [],
    };
    window.__fakeVideo = controls;
  }

  private async openCamera(): Promise<void> {
    try {
      const video = await navigator.mediaDevices.getUserMedia({ video: true });
      this.localStream = video;
    } catch {
      this.localStream = null;
    }
  }

  async setMicrophone(on: boolean): Promise<void> {
    this.audio?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  async setCamera(on: boolean): Promise<void> {
    if (!on) {
      this.localStream?.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      return;
    }
    if (!this.localStream) await this.openCamera();
  }

  async renewToken(token: string): Promise<void> {
    window.__fakeVideo?.renewals.push(token);
  }

  async leave(): Promise<void> {
    if (this.left) return;
    this.left = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.canvasTimer) clearInterval(this.canvasTimer);
    this.audio?.getTracks().forEach((t) => t.stop());
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.audio = null;
    this.localStream = null;
    this.remoteStream = null;
    this.events.clear();
    delete window.__fakeVideo;
  }
}
