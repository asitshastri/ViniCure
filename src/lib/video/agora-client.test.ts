import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoJoinError } from "./client";

// The Agora client against a stand-in SDK: what it asks the SDK for, how it turns the SDK's events
// into ours, and what it releases on leaving. (The real SDK needs a browser and an Agora project.)

class FakeMediaStream {
  tracks: { kind: string }[] = [];
  constructor(tracks: { kind: string }[] = []) {
    this.tracks = [...tracks];
  }
  addTrack(t: { kind: string }) {
    this.tracks.push(t);
  }
  removeTrack(t: { kind: string }) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
  getTracks() {
    return [...this.tracks];
  }
}
vi.stubGlobal("MediaStream", FakeMediaStream);

type Handler = (...args: unknown[]) => void | Promise<void>;
const calls: string[] = [];
let handlers: Record<string, Handler> = {};
let failMic: unknown = null;
let failCam: unknown = null;
let failJoin: unknown = null;
const stopped: string[] = [];

const track = (name: string, kind: string) => ({
  getMediaStreamTrack: () => ({ kind, name }),
  setEnabled: async (on: boolean) => void calls.push(`${name}.setEnabled(${on})`),
  stop: () => void stopped.push(`${name}.stop`),
  close: () => void stopped.push(`${name}.close`),
});

const client = {
  on: (event: string, handler: Handler) => void (handlers[event] = handler),
  removeAllListeners: () => void (handlers = {}),
  join: async (...args: unknown[]) => {
    calls.push(`join:${args[0]}:${args[1]}:${args[3]}`);
    if (failJoin) throw failJoin;
  },
  publish: async (tracks: unknown[]) => void calls.push(`publish:${tracks.length}`),
  subscribe: async (_u: unknown, type: string) => void calls.push(`subscribe:${type}`),
  renewToken: async (t: string) => void calls.push(`renew:${t}`),
  leave: async () => void calls.push("leave"),
};

vi.mock("agora-rtc-sdk-ng", () => ({
  default: {
    setLogLevel: (n: number) => void calls.push(`logLevel:${n}`),
    disableLogUpload: () => void calls.push("disableLogUpload"),
    createClient: (config: unknown) => {
      calls.push(`createClient:${JSON.stringify(config)}`);
      return client;
    },
    createMicrophoneAudioTrack: async () => {
      if (failMic) throw failMic;
      return track("mic", "audio");
    },
    createCameraVideoTrack: async (config: unknown) => {
      calls.push(`camera:${JSON.stringify(config)}`);
      if (failCam) throw failCam;
      return track("cam", "video");
    },
  },
}));

const creds = { appId: "app", channel: "room_name", uid: 42, token: "tok" };

async function make() {
  const { AgoraVideoClient } = await import("./agora-client");
  return AgoraVideoClient.create();
}

beforeEach(() => {
  calls.length = 0;
  stopped.length = 0;
  handlers = {};
  failMic = failCam = failJoin = null;
});

describe("AgoraVideoClient", () => {
  it("turns off log upload, joins a plain room with our id, and publishes the microphone and a modest camera", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    expect(calls).toContain("disableLogUpload");
    expect(calls).toContain("logLevel:3");
    expect(calls).toContain('createClient:{"mode":"rtc","codec":"vp8"}');
    expect(calls).toContain("join:app:room_name:42");
    expect(calls).toContain('camera:{"encoderConfig":"360p_7"}');
    expect(calls).toContain("publish:2");
    expect(video.localStream).not.toBeNull();
  });

  it("with video off it sends audio only, and the camera can be turned on later", async () => {
    const video = await make();
    await video.join(creds, { video: false });
    expect(calls).toContain("publish:1");
    expect(calls.some((c) => c.startsWith("camera:"))).toBe(false);
    expect(video.localStream).toBeNull();
    await video.setCamera(true);
    expect(video.localStream).not.toBeNull();
    expect(calls.filter((c) => c === "publish:1")).toHaveLength(2);
    await video.setCamera(false);
    expect(calls).toContain("cam.setEnabled(false)");
  });

  it("a camera that cannot be opened does not stop the call", async () => {
    failCam = { name: "NotAllowedError" };
    const video = await make();
    await video.join(creds, { video: true });
    expect(video.localStream).toBeNull();
    expect(calls).toContain("publish:1");
  });

  it("no microphone is a clear failure, and nothing is left open", async () => {
    failMic = { code: "PERMISSION_DENIED" };
    const video = await make();
    await expect(video.join(creds, { video: true })).rejects.toMatchObject({
      name: "VideoJoinError",
      kind: "permission",
    });
    expect(calls).toContain("leave");
    failMic = { code: "NOT_READABLE" };
    const again = await make();
    await expect(again.join(creds, { video: true })).rejects.toMatchObject({ kind: "device" });
  });

  it("a refused token or an unreachable service are told apart", async () => {
    for (const [code, kind] of [
      ["INVALID_TOKEN", "token"],
      ["DYNAMIC_KEY_EXPIRED", "token"],
      ["WS_ABORT", "network"],
      ["NETWORK_TIMEOUT", "network"],
      ["SOMETHING_ELSE", "unknown"],
    ] as const) {
      failJoin = { code };
      const video = await make();
      const error = await video.join(creds, { video: true }).catch((e: unknown) => e);
      expect(error, code).toBeInstanceOf(VideoJoinError);
      expect((error as VideoJoinError).kind, code).toBe(kind);
    }
  });

  it("subscribes to what the other person sends and shows it as one stream; their leaving clears it", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    const seen: string[] = [];
    video.on("remote-joined", () => seen.push("joined"));
    video.on("remote-left", () => seen.push("left"));
    video.on("remote-media", () => seen.push("media"));

    handlers["user-joined"]?.({});
    const user = {
      videoTrack: track("remote-video", "video"),
      audioTrack: track("remote-audio", "audio"),
    };
    await handlers["user-published"]?.(user, "video");
    await handlers["user-published"]?.(user, "audio");
    expect(calls).toContain("subscribe:video");
    expect(calls).toContain("subscribe:audio");
    expect(
      video.remoteStream
        ?.getTracks()
        .map((t) => t.kind)
        .sort(),
    ).toEqual(["audio", "video"]);

    handlers["user-unpublished"]?.(user, "video");
    expect(video.remoteStream?.getTracks().map((t) => t.kind)).toEqual(["audio"]);
    handlers["user-left"]?.({});
    expect(video.remoteStream?.getTracks()).toEqual([]);
    expect(seen).toEqual(["joined", "media", "media", "media", "media", "media", "left"]);
  });

  it("maps the connection and the network quality", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    const connection: string[] = [];
    const quality: string[] = [];
    video.on("connection", (c) => connection.push(c));
    video.on("quality", (q) => quality.push(q));
    for (const s of ["CONNECTING", "CONNECTED", "RECONNECTING", "DISCONNECTED"]) {
      handlers["connection-state-change"]?.(s);
    }
    expect(connection).toEqual(["connected", "reconnecting", "disconnected"]);
    handlers["network-quality"]?.({ uplinkNetworkQuality: 1, downlinkNetworkQuality: 2 });
    handlers["network-quality"]?.({ uplinkNetworkQuality: 2, downlinkNetworkQuality: 4 });
    handlers["network-quality"]?.({ uplinkNetworkQuality: 5, downlinkNetworkQuality: 1 });
    handlers["network-quality"]?.({ uplinkNetworkQuality: 0, downlinkNetworkQuality: 0 });
    expect(quality).toEqual(["good", "weak", "poor"]);
  });

  it("asks for a new token when the old one is about to lapse, and passes the new one to the SDK", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    const events: string[] = [];
    video.on("token-expiring", () => events.push("expiring"));
    video.on("token-expired", () => events.push("expired"));
    handlers["token-privilege-will-expire"]?.();
    handlers["token-privilege-did-expire"]?.();
    expect(events).toEqual(["expiring", "expired"]);
    await video.renewToken("new-token");
    expect(calls).toContain("renew:new-token");
  });

  it("leaving releases the camera and microphone and the room, once", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    await video.leave();
    await video.leave();
    expect(stopped.sort()).toEqual(["cam.close", "cam.stop", "mic.close", "mic.stop"]);
    expect(calls.filter((c) => c === "leave")).toHaveLength(1);
    expect(video.localStream).toBeNull();
    expect(video.remoteStream).toBeNull();
  });

  it("after leaving, late connection events are ignored", async () => {
    const video = await make();
    await video.join(creds, { video: true });
    const seen: string[] = [];
    video.on("connection", (c) => seen.push(c));
    const late = handlers["connection-state-change"];
    await video.leave();
    late?.("DISCONNECTED");
    expect(seen).toEqual([]);
  });
});
