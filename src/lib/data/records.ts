import { mockRecords, mockShareTargets } from "@/mocks/records";
import { MAX_MB } from "@/lib/schemas/records";
import type { HealthRecord, RecordStatus, ShareTarget } from "@/lib/types";

// Components call these only. In P7 they use presigned uploads, a virus scan job and signed download links.
// The browser never sees a permanent file address.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function listRecords(filter: { type: string; q: string }): HealthRecord[] {
  const q = filter.q.toLowerCase();
  return mockRecords.filter(
    (r) =>
      (filter.type === "all" || r.type === filter.type) &&
      (!q || r.title.toLowerCase().includes(q)),
  );
}

export function countByType(): Record<string, number> {
  const out: Record<string, number> = { all: mockRecords.length };
  for (const r of mockRecords) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

export function getShareTargets(): ShareTarget[] {
  return mockShareTargets;
}

export function formatSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export type UploadOutcome = {
  status: Extract<RecordStatus, "ready" | "rejected">;
  reason?: string;
};

/** Steps the upload through the same stages the real one will: sending, then scanning, then ready or rejected. */
export async function uploadRecord(
  file: { name: string; size: number },
  onStage: (stage: "uploading" | "scanning", percent: number) => void,
): Promise<UploadOutcome> {
  for (let p = 10; p <= 100; p += 30) {
    onStage("uploading", Math.min(p, 100));
    await delay(250);
  }
  onStage("scanning", 100);
  await delay(900);
  if (file.name.toLowerCase().includes("virus") || file.size > MAX_MB * 1048576) {
    return {
      status: "rejected",
      reason: "Our safety check found a problem with this file, so it was not saved.",
    };
  }
  return { status: "ready" };
}

export async function shareRecord(): Promise<{ status: "shared" }> {
  await delay(500);
  return { status: "shared" };
}

export async function revokeShare(): Promise<{ status: "revoked" }> {
  await delay(400);
  return { status: "revoked" };
}

export async function deleteRecord(): Promise<{ status: "deleted" }> {
  await delay(500);
  return { status: "deleted" };
}
