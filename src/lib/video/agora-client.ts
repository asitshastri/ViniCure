import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";
import {
  Emitter,
  VideoJoinError,
  type JoinCredentials,
  type NetworkQuality,
  type VideoClient,
  type VideoEvents,
} from "./client";

// The real Agora client (P6-06). Loaded only on the call page, with a dynamic import, so the
// heavy SDK never reaches any other page.
//
// What it does not do: it never sends the token or the person's name anywhere but to Agora's
// own servers through the SDK, it turns Agora's log upload off, and it keeps no recording.

type Sdk = typeof import("agora-rtc-sdk-ng").default;

/** Agora's 1 (excellent) to 6 (down) scale, as three words. */
function qualityOf(level: number): NetworkQuality | null {
  if (level === 0) return null; // unknown
  if (level <= 2) return "good";
  if (level <= 4) return "weak";
  return "poor";
}

const worst = (a: NetworkQuality, b: NetworkQuality): NetworkQuality =>
  a === "poor" || b === "poor" ? "poor" : a === "weak" || b === "weak" ? "weak" : "good";

export class AgoraVideoClient implements VideoClient {
  private readonly events = new Emitter();
  private client: IAgoraRTCClient | null = null;
  private mic: IMicrophoneAudioTrack | null = null;
  private cam: ICameraVideoTrack | null = null;
  private left = false;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  private constructor(private readonly sdk: Sdk) {}

  static async create(): Promise<AgoraVideoClient> {
    const sdk = (await import("agora-rtc-sdk-ng")).default;
    // Only errors are logged, and logs are not uploaded to the provider.
    sdk.setLogLevel(3);
    sdk.disableLogUpload();
    return new AgoraVideoClient(sdk);
  }

  on<K extends keyof VideoEvents>(event: K, handler: (value: VideoEvents[K]) => void) {
    return this.events.on(event, handler);
  }

  private addRemote(track: MediaStreamTrack) {
    this.remoteStream ??= new MediaStream();
    this.remoteStream.addTrack(track);
    this.events.emit("remote-media", undefined);
  }

  private removeRemote(kind: "audio" | "video") {
    if (!this.remoteStream) return;
    for (const track of this.remoteStream.getTracks()) {
      if (track.kind === kind) this.remoteStream.removeTrack(track);
    }
    this.events.emit("remote-media", undefined);
  }

  async join(credentials: JoinCredentials, media: { video: boolean }): Promise<void> {
    const client = this.sdk.createClient({ mode: "rtc", codec: "vp8" });
    this.client = client;
    this.left = false;

    client.on("user-joined", () => this.events.emit("remote-joined", undefined));
    client.on("user-left", () => {
      this.removeRemote("audio");
      this.removeRemote("video");
      this.events.emit("remote-left", undefined);
    });
    client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") => {
      await client.subscribe(user, mediaType);
      const track = mediaType === "video" ? user.videoTrack : user.audioTrack;
      const raw = track?.getMediaStreamTrack();
      if (raw) this.addRemote(raw);
    });
    client.on("user-unpublished", (_user: IAgoraRTCRemoteUser, mediaType: "audio" | "video") =>
      this.removeRemote(mediaType),
    );
    client.on("connection-state-change", (current: string) => {
      if (this.left) return;
      if (current === "CONNECTED") this.events.emit("connection", "connected");
      else if (current === "RECONNECTING") this.events.emit("connection", "reconnecting");
      else if (current === "DISCONNECTED") this.events.emit("connection", "disconnected");
    });
    client.on(
      "network-quality",
      (stats: { uplinkNetworkQuality: number; downlinkNetworkQuality: number }) => {
        const up = qualityOf(stats.uplinkNetworkQuality);
        const down = qualityOf(stats.downlinkNetworkQuality);
        if (up && down) this.events.emit("quality", worst(up, down));
      },
    );
    client.on("token-privilege-will-expire", () => this.events.emit("token-expiring", undefined));
    client.on("token-privilege-did-expire", () => this.events.emit("token-expired", undefined));

    try {
      await client.join(credentials.appId, credentials.channel, credentials.token, credentials.uid);
    } catch (error) {
      throw this.failure(error, "join");
    }

    // The microphone is required; the camera is not.
    try {
      this.mic = await this.sdk.createMicrophoneAudioTrack();
    } catch (error) {
      await this.release();
      throw this.failure(error, "microphone");
    }
    if (media.video) await this.openCamera();
    await client.publish([this.mic, ...(this.cam ? [this.cam] : [])]);
  }

  private async openCamera(): Promise<void> {
    try {
      // A modest size and rate: calls run on mobile data.
      this.cam = await this.sdk.createCameraVideoTrack({ encoderConfig: "360p_7" });
      this.localStream = new MediaStream([this.cam.getMediaStreamTrack()]);
    } catch {
      // No camera, or the person said no: the call goes on with audio.
      this.cam = null;
      this.localStream = null;
    }
  }

  private failure(error: unknown, step: "join" | "microphone"): VideoJoinError {
    const code = String((error as { code?: string })?.code ?? "");
    const name = String((error as { name?: string })?.name ?? "");
    if (step === "microphone") {
      if (/PERMISSION_DENIED|NotAllowed/i.test(code + name)) {
        return new VideoJoinError("permission", "microphone permission was refused", {
          cause: error,
        });
      }
      return new VideoJoinError("device", "no microphone could be opened", { cause: error });
    }
    if (/INVALID_TOKEN|TOKEN_EXPIRED|DYNAMIC_KEY|INVALID_OPERATION/i.test(code)) {
      return new VideoJoinError("token", "the token was refused", { cause: error });
    }
    if (/NETWORK|WS_ABORT|UNEXPECTED_ERROR|TIMEOUT|GATEWAY/i.test(code)) {
      return new VideoJoinError("network", "could not reach the video service", { cause: error });
    }
    return new VideoJoinError("unknown", "could not join the call", { cause: error });
  }

  async setMicrophone(on: boolean): Promise<void> {
    await this.mic?.setEnabled(on);
  }

  async setCamera(on: boolean): Promise<void> {
    if (!this.client) return;
    if (!on) {
      await this.cam?.setEnabled(false);
      return;
    }
    if (this.cam) {
      await this.cam.setEnabled(true);
      return;
    }
    await this.openCamera();
    if (this.cam) await this.client.publish([this.cam]);
  }

  async renewToken(token: string): Promise<void> {
    await this.client?.renewToken(token);
  }

  private async release(): Promise<void> {
    for (const track of [this.mic, this.cam]) {
      track?.stop();
      track?.close();
    }
    this.mic = null;
    this.cam = null;
    this.localStream = null;
    try {
      await this.client?.leave();
    } catch {
      // Already out.
    }
  }

  async leave(): Promise<void> {
    if (this.left) return;
    this.left = true;
    await this.release();
    this.remoteStream = null;
    this.client?.removeAllListeners();
    this.events.clear();
  }
}
