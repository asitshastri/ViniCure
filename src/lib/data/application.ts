import { buildApplication } from "@/mocks/application";
import type { DoctorApplication } from "@/lib/types";

// Components get the doctor's application through this layer only. In P9 the server stores documents privately, scans
// them, and shows them only to the review team. A doctor can never mark a document accepted.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getApplication = (scenario: string): DoctorApplication => buildApplication(scenario);

export async function saveDraft(): Promise<{ status: "saved" }> {
  await delay(450);
  return { status: "saved" };
}

export async function submitApplication(): Promise<{ status: "submitted" }> {
  await delay(900);
  return { status: "submitted" };
}

export type DocUploadResult = { status: "uploaded" } | { status: "rejected"; reason: string };

export async function uploadDocument(
  file: { name: string },
  onStage: (s: "uploading" | "scanning") => void,
): Promise<DocUploadResult> {
  onStage("uploading");
  await delay(700);
  onStage("scanning");
  await delay(900);
  if (file.name.toLowerCase().includes("virus"))
    return {
      status: "rejected",
      reason: "Our safety check found a problem with this file, so it was not saved.",
    };
  return { status: "uploaded" };
}
