import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../errors/app-error";
import {
  PURPOSE_POLICY,
  detectType,
  extensionFor,
  type DetectedType,
  type FilePurpose,
} from "./policy";

// Storage module (S3, MinIO locally). Every object is private. Clients upload and
// download only through short-lived presigned URLs, and the stored name is a
// random key, never the file name the client sent.

export type StorageConfig = {
  buckets: { files: string; exports: string; recordings?: string };
  region: string;
  /** MinIO endpoint in development. Empty in production. */
  endpoint?: string;
  /** Lifetime of presigned URLs in seconds. */
  signedUrlTtlSeconds: number;
};

export type UploadSlot = {
  storageKey: string;
  bucket: string;
  url: string;
  /** The client must send exactly these headers or the signature fails. */
  headers: { "Content-Type": string; "Content-Length": string };
  expiresAt: Date;
};

export type ObjectInfo = { sizeBytes: number; contentType: string | undefined };

/** The part of S3 the service uses, so tests can run without a server. */
export interface ObjectStore {
  presignPut(args: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }): Promise<string>;
  presignGet(args: {
    bucket: string;
    key: string;
    ttlSeconds: number;
    contentType: string;
    disposition: string;
  }): Promise<string>;
  head(bucket: string, key: string): Promise<ObjectInfo | null>;
  readHead(bucket: string, key: string, bytes: number): Promise<Uint8Array>;
  /** The whole object as a stream of chunks, for the virus scan. */
  read(bucket: string, key: string): Promise<AsyncIterable<Uint8Array>>;
  /** Writes a whole object (server-generated files only). */
  put(args: { bucket: string; key: string; body: Uint8Array; contentType: string }): Promise<void>;
  delete(bucket: string, key: string): Promise<void>;
}

export class S3ObjectStore implements ObjectStore {
  readonly client: S3Client;

  constructor(config: Pick<StorageConfig, "region" | "endpoint">, client?: S3Client) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
        // Credentials come from the default chain: the task role in AWS, env vars locally.
        requestHandler: { requestTimeout: 5000, connectionTimeout: 2000 },
        maxAttempts: 2,
      });
  }

  presignPut(a: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: a.bucket,
        Key: a.key,
        ContentType: a.contentType,
        ContentLength: a.contentLength,
      }),
      { expiresIn: a.ttlSeconds, signableHeaders: new Set(["content-type", "content-length"]) },
    );
  }

  presignGet(a: {
    bucket: string;
    key: string;
    ttlSeconds: number;
    contentType: string;
    disposition: string;
  }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: a.bucket,
        Key: a.key,
        ResponseContentType: a.contentType,
        ResponseContentDisposition: a.disposition,
      }),
      { expiresIn: a.ttlSeconds },
    );
  }

  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: out.ContentLength ?? 0, contentType: out.ContentType };
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async readHead(bucket: string, key: string, bytes: number): Promise<Uint8Array> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    return (await out.Body?.transformToByteArray()) ?? new Uint8Array();
  }

  async read(bucket: string, key: string): Promise<AsyncIterable<Uint8Array>> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    // In Node the body is a readable stream, which is async iterable.
    if (!out.Body) throw new Error("object has no body");
    return out.Body as unknown as AsyncIterable<Uint8Array>;
  }

  async put(a: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: a.bucket,
        Key: a.key,
        Body: a.body,
        ContentType: a.contentType,
        ContentLength: a.body.byteLength,
        // The bucket encrypts at rest; asking for it here as well keeps a misconfigured bucket honest.
        ServerSideEncryption: "AES256",
      }),
    );
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

/** Name used for the download, with anything that could break a header or path removed. */
export function safeDownloadName(name: string | undefined, fallback: string): string {
  const cleaned = (name ?? "")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

const KEY_SHAPE = /^[a-z_]+\/\d{4}\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;

export class StorageService {
  constructor(
    private readonly store: ObjectStore,
    private readonly config: StorageConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** The bucket for a purpose. The recordings bucket exists only when recording is set up. */
  private bucket(name: "files" | "exports" | "recordings"): string {
    const bucket = this.config.buckets[name];
    if (!bucket) throw new AppError("unavailable", { detail: "File storage is not available." });
    return bucket;
  }

  /** The random storage key for a new object. The client's file name is never part of it. */
  newKey(purpose: FilePurpose, type: DetectedType): string {
    const year = new Date(this.now()).getUTCFullYear();
    return `${purpose}/${year}/${randomUUID()}.${extensionFor(type)}`;
  }

  /** Checks the request against the purpose policy, then returns a presigned PUT slot. */
  async createUploadSlot(input: {
    purpose: FilePurpose;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadSlot> {
    const policy = PURPOSE_POLICY[input.purpose];
    if (!policy || !policy.clientUpload) {
      throw new AppError("file_rejected", { detail: "This kind of file cannot be uploaded here." });
    }
    const type = policy.types.find((allowed) => allowed === input.contentType);
    if (!type) throw new AppError("file_rejected", { detail: "This file type is not allowed." });
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > policy.maxBytes
    ) {
      throw new AppError("file_rejected", { detail: "This file is too large or empty." });
    }

    const bucket = this.bucket(policy.bucket);
    const storageKey = this.newKey(input.purpose, type);
    const ttl = this.config.signedUrlTtlSeconds;
    const url = await this.store.presignPut({
      bucket,
      key: storageKey,
      contentType: type,
      contentLength: input.sizeBytes,
      ttlSeconds: ttl,
    });
    return {
      storageKey,
      bucket,
      url,
      headers: { "Content-Type": type, "Content-Length": String(input.sizeBytes) },
      expiresAt: new Date(this.now() + ttl * 1000),
    };
  }

  /**
   * The "complete" step: the object exists, its size matches what was declared and is within
   * the limit, and its first bytes really are the declared type. Anything else is deleted.
   */
  async verifyUpload(input: {
    purpose: FilePurpose;
    storageKey: string;
    declaredType: string;
    declaredSizeBytes: number;
  }): Promise<{ type: DetectedType; sizeBytes: number }> {
    const policy = PURPOSE_POLICY[input.purpose];
    if (!KEY_SHAPE.test(input.storageKey) || !input.storageKey.startsWith(`${input.purpose}/`)) {
      throw new AppError("file_rejected", { detail: "Unknown file." });
    }
    const bucket = this.bucket(policy.bucket);
    const info = await this.store.head(bucket, input.storageKey);
    if (!info) throw new AppError("file_rejected", { detail: "The upload did not arrive." });

    const reject = async (detail: string): Promise<never> => {
      await this.store.delete(bucket, input.storageKey);
      throw new AppError("file_rejected", { detail });
    };
    if (info.sizeBytes > policy.maxBytes || info.sizeBytes !== input.declaredSizeBytes) {
      return reject("The file size does not match.");
    }
    const detected = detectType(await this.store.readHead(bucket, input.storageKey, 16));
    if (!detected || !policy.types.includes(detected) || detected !== input.declaredType) {
      return reject("The file content does not match its type.");
    }
    return { type: detected, sizeBytes: info.sizeBytes };
  }

  /** A short-lived link to read one object. Always sent as a download, never rendered by the site. */
  async createDownloadUrl(input: {
    purpose: FilePurpose;
    storageKey: string;
    type: DetectedType;
    fileName?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const policy = PURPOSE_POLICY[input.purpose];
    if (!KEY_SHAPE.test(input.storageKey) || !input.storageKey.startsWith(`${input.purpose}/`)) {
      throw new AppError("not_found");
    }
    const name = safeDownloadName(input.fileName, `file.${extensionFor(input.type)}`);
    const ttl = this.config.signedUrlTtlSeconds;
    const url = await this.store.presignGet({
      bucket: this.bucket(policy.bucket),
      key: input.storageKey,
      ttlSeconds: ttl,
      contentType: input.type,
      disposition: `attachment; filename="${name}"`,
    });
    return { url, expiresAt: new Date(this.now() + ttl * 1000) };
  }

  /**
   * Stores a file the server made itself (an invoice or prescription PDF). Only purposes that
   * clients cannot upload to are allowed, the bytes must really be the type the policy names, and
   * the size is checked against the limit. Returns the random storage key and the file's hash.
   */
  async storeGenerated(input: {
    purpose: FilePurpose;
    bytes: Uint8Array;
  }): Promise<{ storageKey: string; type: DetectedType; sizeBytes: number; sha256: string }> {
    const policy = PURPOSE_POLICY[input.purpose];
    if (!policy || policy.clientUpload) {
      throw new AppError("file_rejected", {
        detail: "This kind of file is not made by the server.",
      });
    }
    const type = detectType(input.bytes.subarray(0, 16));
    if (!type || !policy.types.includes(type)) {
      throw new AppError("file_rejected", { detail: "The file content is not an allowed type." });
    }
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > policy.maxBytes) {
      throw new AppError("file_rejected", { detail: "This file is too large or empty." });
    }
    const storageKey = this.newKey(input.purpose, type);
    await this.store.put({
      bucket: this.bucket(policy.bucket),
      key: storageKey,
      body: input.bytes,
      contentType: type,
    });
    return {
      storageKey,
      type,
      sizeBytes: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
  }

  /** The bytes of one stored object, for the scanner. The purpose comes from the key itself. */
  async openForScan(storageKey: string): Promise<AsyncIterable<Uint8Array>> {
    const purpose = storageKey.split("/")[0] as FilePurpose;
    if (!KEY_SHAPE.test(storageKey) || !(purpose in PURPOSE_POLICY)) {
      throw new AppError("not_found");
    }
    return this.store.read(this.bucket(PURPOSE_POLICY[purpose].bucket), storageKey);
  }

  /**
   * What the provider wrote at a key we chose: its size and first bytes, or null if nothing is
   * there yet. The purpose comes from the key itself.
   */
  async inspect(storageKey: string): Promise<{ sizeBytes: number; head: Uint8Array } | null> {
    const purpose = storageKey.split("/")[0] as FilePurpose;
    if (!KEY_SHAPE.test(storageKey) || !(purpose in PURPOSE_POLICY)) {
      throw new AppError("not_found");
    }
    const bucket = this.bucket(PURPOSE_POLICY[purpose].bucket);
    const info = await this.store.head(bucket, storageKey);
    if (!info) return null;
    return { sizeBytes: info.sizeBytes, head: await this.store.readHead(bucket, storageKey, 16) };
  }

  /** SHA-256 of a stored object, read as a stream (it can be large). */
  async sha256Of(storageKey: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of await this.openForScan(storageKey)) hash.update(chunk);
    return hash.digest("hex");
  }

  async remove(purpose: FilePurpose, storageKey: string): Promise<void> {
    await this.store.delete(this.bucket(PURPOSE_POLICY[purpose].bucket), storageKey);
  }
}
