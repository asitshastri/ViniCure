import { FAKE_APP_ID, type VideoClient } from "./client";

export * from "./client";

/**
 * The video client for this call. The real SDK is imported here and nowhere else, so it is only
 * downloaded on the call page. The fake is used only when the server says it is running the fake
 * provider (which production refuses to do).
 */
export async function createVideoClient(appId: string): Promise<VideoClient> {
  if (appId === FAKE_APP_ID) {
    const { FakeVideoClient } = await import("./fake-client");
    return new FakeVideoClient();
  }
  const { AgoraVideoClient } = await import("./agora-client");
  return AgoraVideoClient.create();
}
