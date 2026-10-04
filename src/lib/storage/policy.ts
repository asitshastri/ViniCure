// Upload policy per file purpose (backend-architecture.md section 12). Allowed
// types are an explicit list per purpose. Sizes are proposals pending the human's
// confirmation (docs limits: documents 20 MB, images 10 MB).

export const FILE_PURPOSES = [
  "kyc",
  "patient_document",
  "prescription_pdf",
  "invoice_pdf",
  "recording",
  "export",
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export type DetectedType =
  "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "video/mp4";

export type PurposePolicy = {
  bucket: "files" | "exports" | "recordings";
  /** Only these types, checked against the declared type and again against the bytes. */
  types: readonly DetectedType[];
  maxBytes: number;
  /** False for files our own server or the video provider writes. */
  clientUpload: boolean;
};

const MB = 1024 * 1024;

export const PURPOSE_POLICY: Record<FilePurpose, PurposePolicy> = {
  kyc: {
    bucket: "files",
    types: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 10 * MB,
    clientUpload: true,
  },
  patient_document: {
    bucket: "files",
    types: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxBytes: 20 * MB,
    clientUpload: true,
  },
  prescription_pdf: {
    bucket: "files",
    types: ["application/pdf"],
    maxBytes: 5 * MB,
    clientUpload: false,
  },
  invoice_pdf: {
    bucket: "files",
    types: ["application/pdf"],
    maxBytes: 5 * MB,
    clientUpload: false,
  },
  // Recordings live in their own bucket in Mumbai (P6-08), written by the video provider.
  recording: {
    bucket: "recordings",
    types: ["video/mp4"],
    maxBytes: 2048 * MB,
    clientUpload: false,
  },
  export: {
    bucket: "exports",
    types: ["application/pdf"],
    maxBytes: 200 * MB,
    clientUpload: false,
  },
};

const EXTENSION: Record<DetectedType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

export function extensionFor(type: DetectedType): string {
  return EXTENSION[type];
}

/** Identifies a file from its first bytes. Returns null for anything not on the list. */
export function detectType(head: Uint8Array): DetectedType | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, i) => head[i] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) && // RIFF....WEBP
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "image/webp";
  }
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70)
    return "video/mp4"; // ....ftyp
  return null;
}
