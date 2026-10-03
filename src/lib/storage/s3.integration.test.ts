import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ObjectStore, StorageService } from "./storage";

// Runs against MinIO from docker/compose.yml. Skipped unless S3_TEST_ENDPOINT is set:
//   S3_TEST_ENDPOINT=http://localhost:9000 pnpm test
const endpoint = process.env.S3_TEST_ENDPOINT;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

describe.skipIf(!endpoint)("storage against MinIO", () => {
  const client = new S3Client({
    region: "ap-south-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: "dev", secretAccessKey: "dev-only-change-me" },
  });
  const service = new StorageService(new S3ObjectStore({ region: "ap-south-1" }, client), {
    buckets: { files: "vinicure-files", exports: "vinicure-exports" },
    region: "ap-south-1",
    endpoint,
    signedUrlTtlSeconds: 60,
  });

  it("uploads through a presigned URL, verifies it, and downloads through a presigned URL", async () => {
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: PDF.length,
    });
    const put = await fetch(slot.url, { method: "PUT", headers: slot.headers, body: PDF });
    expect(put.status).toBe(200);

    const verified = await service.verifyUpload({
      purpose: "patient_document",
      storageKey: slot.storageKey,
      declaredType: "application/pdf",
      declaredSizeBytes: PDF.length,
    });
    expect(verified.type).toBe("application/pdf");

    const { url } = await service.createDownloadUrl({
      purpose: "patient_document",
      storageKey: slot.storageKey,
      type: "application/pdf",
      fileName: "report.pdf",
    });
    const got = await fetch(url);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await got.arrayBuffer()).equals(PDF)).toBe(true);
    await service.remove("patient_document", slot.storageKey);
  });

  it("refuses an upload that changes the type or size from what was signed", async () => {
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: PDF.length,
    });
    const wrongType = await fetch(slot.url, {
      method: "PUT",
      headers: { "Content-Type": "text/html", "Content-Length": String(PDF.length) },
      body: PDF,
    });
    expect(wrongType.status).toBe(403);
    const wrongSize = await fetch(slot.url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.concat([PDF, PDF]),
    });
    expect(wrongSize.status).toBe(403);
  });

  it("rejects and deletes a disguised executable at the complete step", async () => {
    const exe = Buffer.from([
      0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0, 1, 2, 3,
    ]);
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: exe.length,
    });
    expect(
      (await fetch(slot.url, { method: "PUT", headers: slot.headers, body: exe })).status,
    ).toBe(200);
    await expect(
      service.verifyUpload({
        purpose: "patient_document",
        storageKey: slot.storageKey,
        declaredType: "application/pdf",
        declaredSizeBytes: exe.length,
      }),
    ).rejects.toMatchObject({ code: "file_rejected" });
    const { url } = await service.createDownloadUrl({
      purpose: "patient_document",
      storageKey: slot.storageKey,
      type: "application/pdf",
    });
    expect((await fetch(url)).status).toBe(404);
  });
});
