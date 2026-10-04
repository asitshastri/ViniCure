// The browser side of a video call (P6-06). Screens talk to this interface only, so the real
// Agora client, the test fake and any future provider are interchangeable, and the heavy SDK is
// loaded only on the call page.

/** What the server's join answer gives the browser. */
export type JoinCredentials = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
};

export type ConnectionState = "connected" | "reconnecting" | "disconnected";
export type NetworkQuality = "good" | "weak" | "poor";

export type VideoEvents = {
  /** The other person is in the room. */
  "remote-joined": undefined;
  "remote-left": undefined;
  /** The other person's audio or video started or stopped; read `remoteStream` again. */
  "remote-media": undefined;
  connection: ConnectionState;
  quality: NetworkQuality;
  /** The token will lapse soon: ask the server for a new one and call `renewToken`. */
  "token-expiring": undefined;
  "token-expired": undefined;
};

export type JoinFailure = "permission" | "device" | "network" | "token" | "unknown";

export class VideoJoinError extends Error {
  constructor(
    readonly kind: JoinFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "VideoJoinError";
  }
}

export interface VideoClient {
  /** Our own camera, for the small self view. Null until joined or while the camera is off. */
  readonly localStream: MediaStream | null;
  /** The other person's audio and video together, for one <video> element. */
  readonly remoteStream: MediaStream | null;
  /**
   * Opens the microphone (and the camera unless `video` is false), enters the room and sends. A
   * camera that cannot be opened does not stop the call: it continues with audio only.
   */
  join(credentials: JoinCredentials, media: { video: boolean }): Promise<void>;
  setMicrophone(on: boolean): Promise<void>;
  setCamera(on: boolean): Promise<void>;
  renewToken(token: string): Promise<void>;
  /** Leaves the room and releases the camera and microphone. Safe to call twice. */
  leave(): Promise<void>;
  /** Subscribes to an event; returns a function that stops listening. */
  on<K extends keyof VideoEvents>(event: K, handler: (value: VideoEvents[K]) => void): () => void;
}

/** A tiny typed event emitter shared by the clients. */
export class Emitter {
  private readonly handlers = new Map<string, Set<(value: never) => void>>();

  on<K extends keyof VideoEvents>(event: K, handler: (value: VideoEvents[K]) => void): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (value: never) => void);
    this.handlers.set(event, set);
    return () => void set.delete(handler as (value: never) => void);
  }

  emit<K extends keyof VideoEvents>(event: K, value: VideoEvents[K]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (value: VideoEvents[K]) => void)(value);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** The app id the server hands out while the fake provider is in use (never in production). */
export const FAKE_APP_ID = "fake_app_id";
