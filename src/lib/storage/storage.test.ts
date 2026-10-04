import { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it } from "vitest";
import { PURPOSE_POLICY, detectType, type FilePurpose } from "./policy";
import {
  S3ObjectStore,
  StorageService,
  safeDownloadName,
  type ObjectInfo,
  type ObjectStore,
  type StorageConfig,
} from "./storage";

const config: StorageConfig = {
  buckets: { files: "vc-files", exports: "vc-exports" },
  region: "ap-south-1",
  signedUrlTtlSeconds: 300,
};

const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const JPG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1,
]);
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);

class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, { head: Uint8Array; size: number; type: string }>();
  readonly deleted: string[] = [];
  async presignPut(a: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }) {
    return `https://fake/${a.bucket}/${a.key}?ttl=${a.ttlSeconds}&type=${a.contentType}&len=${a.contentLength}`;
  }
  async presignGet(a: {
    bucket: string;
    key: string;
    ttlSeconds: number;
    contentType: string;
    disposition: string;
  }) {
    return `https://fake/${a.bucket}/${a.key}?ttl=${a.ttlSeconds}&d=${encodeURIComponent(a.disposition)}`;
  }
  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(`${bucket}/${key}`);
    return o ? { sizeBytes: o.size, contentType: o.type } : null;
  }
  async readHead(bucket: string, key: string) {
    return this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
  }
  async read(bucket: string, key: string) {
    const head = this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
    return (async function* () {
      yield head;
    })();
  }
  async delete(bucket: string, key: string) {
    this.deleted.push(`${bucket}/${key}`);
    this.objects.delete(`${bucket}/${key}`);
  }
  seed(bucket: string, key: string, head: Uint8Array, size: number) {
    this.objects.set(`${bucket}/${key}`, { head, size, type: "x" });
  }
  readonly written: { bucket: string; key: string; body: Uint8Array; contentType: string }[] = [];
  async put(a: { bucket: string; key: string; body: Uint8Array; contentType: string }) {
    this.written.push(a);
    this.objects.set(`${a.bucket}/${a.key}`, {
      head: a.body.subarray(0, 16),
      size: a.body.byteLength,
      type: a.contentType,
    });
  }
}

let store: MemoryObjectStore;
let service: StorageService;
beforeEach(() => {
  store = new MemoryObjectStore();
  service = new StorageService(store, config, () => Date.UTC(2026, 9, 3));
});

describe("magic bytes", () => {
  it("recognises the allowed types and nothing else", () => {
    expect(detectType(PDF)).toBe("application/pdf");
    expect(detectType(JPG)).toBe("image/jpeg");
    expect(detectType(PNG)).toBe("image/png");
    expect(detectType(EXE)).toBeNull();
    expect(detectType(new Uint8Array())).toBeNull();
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectType(webp)).toBe("image/webp");
  });
});

describe("upload slots", () => {
  it("returns a random key that does not contain the client's file name", async () => {
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(slot.storageKey).toMatch(/^patient_document\/2026\/[0-9a-f-]{36}\.pdf$/);
    expect(slot.bucket).toBe("vc-files");
    expect(slot.headers).toEqual({ "Content-Type": "application/pdf", "Content-Length": "1000" });
    expect(slot.expiresAt).toEqual(new Date(Date.UTC(2026, 9, 3) + 300_000));
    const other = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(other.storageKey).not.toBe(slot.storageKey);
  });

  it.each([
    ["a type that is not allowed", { purpose: "kyc", contentType: "image/webp", sizeBytes: 100 }],
    [
      "an executable",
      { purpose: "patient_document", contentType: "application/x-msdownload", sizeBytes: 100 },
    ],
    ["html", { purpose: "patient_document", contentType: "text/html", sizeBytes: 100 }],
    [
      "too large",
      { purpose: "kyc", contentType: "application/pdf", sizeBytes: 10 * 1024 * 1024 + 1 },
    ],
    ["empty", { purpose: "kyc", contentType: "application/pdf", sizeBytes: 0 }],
    ["a fractional size", { purpose: "kyc", contentType: "application/pdf", sizeBytes: 10.5 }],
    [
      "a server-written purpose",
      { purpose: "prescription_pdf", contentType: "application/pdf", sizeBytes: 100 },
    ],
    ["recordings", { purpose: "recording", contentType: "video/mp4", sizeBytes: 100 }],
  ] as const)("refuses %s", async (_label, input) => {
    await expect(
      service.createUploadSlot(
        input as { purpose: FilePurpose; contentType: string; sizeBytes: number },
      ),
    ).rejects.toMatchObject({
      code: "file_rejected",
    });
  });

  it("every purpose has a policy and only client-upload purposes can get a slot", () => {
    for (const purpose of [
      "kyc",
      "patient_document",
      "prescription_pdf",
      "invoice_pdf",
      "recording",
      "export",
    ] as const) {
      expect(PURPOSE_POLICY[purpose].types.length).toBeGreaterThan(0);
    }
  });
});

describe("complete step", () => {
  const upload = async (head: Uint8Array, size = 2000) => {
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: size,
    });
    store.seed(slot.bucket, slot.storageKey, head, size);
    return slot;
  };
  const verify = (key: string, size = 2000, type = "application/pdf") =>
    service.verifyUpload({
      purpose: "patient_document",
      storageKey: key,
      declaredType: type,
      declaredSizeBytes: size,
    });

  it("accepts an object whose size and first bytes match", async () => {
    const slot = await upload(PDF);
    expect(await verify(slot.storageKey)).toEqual({ type: "application/pdf", sizeBytes: 2000 });
    expect(store.deleted).toHaveLength(0);
  });

  it("rejects and deletes an executable renamed to PDF", async () => {
    const slot = await upload(EXE);
    await expect(verify(slot.storageKey)).rejects.toMatchObject({ code: "file_rejected" });
    expect(store.deleted).toContain(`vc-files/${slot.storageKey}`);
  });

  it("rejects and deletes a JPEG that was declared as PDF", async () => {
    const slot = await upload(JPG);
    await expect(verify(slot.storageKey)).rejects.toMatchObject({ code: "file_rejected" });
    expect(store.deleted).toHaveLength(1);
  });

  it("rejects and deletes an object whose size differs from the declared size", async () => {
    const slot = await upload(PDF, 5000);
    await expect(verify(slot.storageKey, 2000)).rejects.toMatchObject({ code: "file_rejected" });
    expect(store.deleted).toHaveLength(1);
  });

  it("rejects an upload that never arrived, and keys that are not ours", async () => {
    const slot = await service.createUploadSlot({
      purpose: "patient_document",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    await expect(verify(slot.storageKey, 100)).rejects.toMatchObject({ code: "file_rejected" });
    for (const key of [
      "../etc/passwd",
      "kyc/2026/00000000-0000-0000-0000-000000000000.pdf",
      "patient_document/2026/x.pdf",
    ]) {
      await expect(verify(key)).rejects.toMatchObject({ code: "file_rejected" });
    }
  });
});

describe("downloads", () => {
  const key = "patient_document/2026/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.pdf";

  it("signs a short-lived link that forces a download of a fixed type", async () => {
    const { url, expiresAt } = await service.createDownloadUrl({
      purpose: "patient_document",
      storageKey: key,
      type: "application/pdf",
      fileName: "Blood test.pdf",
    });
    expect(url).toContain("ttl=300");
    expect(decodeURIComponent(url)).toContain('attachment; filename="Blood test.pdf"');
    expect(expiresAt.getTime()).toBe(Date.UTC(2026, 9, 3) + 300_000);
  });

  it("cleans hostile file names and refuses keys from another purpose or with traversal", async () => {
    expect(safeDownloadName('../../x"; filename="evil.exe', "f.pdf")).toBe("x filenameevil.exe");
    expect(safeDownloadName("\r\nSet-Cookie: a=b", "f.pdf")).not.toMatch(/[\r\n:]/);
    expect(safeDownloadName(undefined, "f.pdf")).toBe("f.pdf");
    expect(safeDownloadName("....", "f.pdf")).toBe("f.pdf");
    await expect(
      service.createDownloadUrl({ purpose: "kyc", storageKey: key, type: "application/pdf" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.createDownloadUrl({
        purpose: "kyc",
        storageKey: "kyc/../../a",
        type: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("presigned URLs from the real S3 client (offline)", () => {
  const client = new S3Client({
    region: "ap-south-1",
    endpoint: "http://localhost:9000",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
  });
  const real = new StorageService(new S3ObjectStore({ region: "ap-south-1" }, client), config);

  it("an upload URL is signed for content type and length and expires in 300 seconds", async () => {
    const slot = await real.createUploadSlot({
      purpose: "kyc",
      contentType: "image/png",
      sizeBytes: 4096,
    });
    const url = new URL(slot.url);
    expect(url.pathname).toBe(`/vc-files/${slot.storageKey}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "host"]));
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(slot.url).not.toContain("test-secret");
  });

  it("a download URL expires in 300 seconds and forces attachment", async () => {
    const out = await real.createDownloadUrl({
      purpose: "patient_document",
      storageKey: "patient_document/2026/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.pdf",
      type: "application/pdf",
      fileName: "report.pdf",
    });
    const url = new URL(out.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="report.pdf"',
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
  });
});

describe("files the server makes itself", () => {
  const pdf = (n: number) => {
    const b = new Uint8Array(n);
    b.set(PDF);
    return b;
  };

  it("stores a PDF under a random key and returns its size and hash", async () => {
    const out = await service.storeGenerated({ purpose: "invoice_pdf", bytes: pdf(100) });
    expect(out.storageKey).toMatch(/^invoice_pdf\/\d{4}\/[0-9a-f-]{36}\.pdf$/);
    expect(out).toMatchObject({ type: "application/pdf", sizeBytes: 100 });
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(store.written).toHaveLength(1);
    expect(store.written[0]).toMatchObject({ bucket: "vc-files", contentType: "application/pdf" });
  });

  it("refuses purposes that clients upload to, content that is not the allowed type, and bad sizes", async () => {
    for (const purpose of ["kyc", "patient_document"] as const) {
      await expect(service.storeGenerated({ purpose, bytes: pdf(100) })).rejects.toMatchObject({
        code: "file_rejected",
      });
    }
    await expect(
      service.storeGenerated({ purpose: "invoice_pdf", bytes: JPG }),
    ).rejects.toMatchObject({ code: "file_rejected" });
    await expect(
      service.storeGenerated({ purpose: "invoice_pdf", bytes: new Uint8Array() }),
    ).rejects.toMatchObject({ code: "file_rejected" });
    await expect(
      service.storeGenerated({
        purpose: "invoice_pdf",
        bytes: pdf(PURPOSE_POLICY.invoice_pdf.maxBytes + 1),
      }),
    ).rejects.toMatchObject({ code: "file_rejected" });
    expect(store.written).toHaveLength(0);
  });
});
