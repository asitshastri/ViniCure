import type { AuditWriter } from "../api/deps";
import { errors } from "../errors/app-error";
import { isSensitiveKey } from "../logging/redact";
import { logger as defaultLogger } from "../logging/logger";
import type { Logger } from "pino";

// Two append-only streams (backend-architecture.md section 14):
//   audit_logs      who did what to which entity, from where
//   phi_access_logs who read which patient's clinical data, and why
//
// The store interface has no update and no delete, and the database role has
// INSERT only (migration grants). Metadata holds IDs and changed field names,
// never values: the checks below reject anything that looks like content.

export const PHI_PURPOSES = ["treatment", "patient_self", "support_break_glass", "legal"] as const;
export type PhiPurpose = (typeof PHI_PURPOSES)[number];

export const PHI_RESOURCE_TYPES = [
  "clinical_note",
  "prescription",
  "vital",
  "condition",
  "document",
  "recording",
  "patient_summary",
] as const;
export type PhiResourceType = (typeof PHI_RESOURCE_TYPES)[number];

const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const ENTITY = /^[a-z][a-z0-9_]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Words that mean free text or clinical content. Their keys are refused as metadata. */
const CONTENT_WORDS = [
  "diagnosis",
  "note",
  "notes",
  "prescription",
  "symptom",
  "symptoms",
  "medication",
  "medicine",
  "advice",
  "instruction",
  "instructions",
  "reason",
  "comment",
  "message",
  "body",
  "text",
  "content",
  "description",
  "complaint",
  "condition",
  "allergy",
  "allergies",
  "vital",
  "value",
  "name",
  "phone",
  "email",
  "address",
  "dob",
  "birth",
];

const MAX_META_KEYS = 20;
const MAX_STRING = 80;
const MAX_ARRAY = 20;
// Whole value is a phone number. Not a search inside the text, which would flag UUIDs.
const PHONE_LIKE = /^\+?\d[\d\s().-]{8,}\d$/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export type MetaValue = string | number | boolean | null | string[];
export type AuditMetadata = Record<string, MetaValue>;

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata;
};

export type PhiAccessEntry = {
  actorUserId: string;
  patientId: string;
  resourceType: PhiResourceType;
  resourceId: string;
  purpose: PhiPurpose;
};

export type StoredAudit = AuditEntry & { occurredAt: Date };
export type StoredPhiAccess = PhiAccessEntry & { occurredAt: Date };

/** Append only: there is deliberately no update or delete here. */
export interface AuditStore {
  append(entry: StoredAudit): Promise<void>;
  appendPhi(entry: StoredPhiAccess): Promise<void>;
}

export class MemoryAuditStore implements AuditStore {
  readonly audit: StoredAudit[] = [];
  readonly phi: StoredPhiAccess[] = [];
  async append(entry: StoredAudit) {
    this.audit.push(Object.freeze({ ...entry }));
  }
  async appendPhi(entry: StoredPhiAccess) {
    this.phi.push(Object.freeze({ ...entry }));
  }
}

export class AuditValidationError extends Error {
  constructor(reason: string) {
    super(`Invalid audit entry: ${reason}`);
    this.name = "AuditValidationError";
  }
}

function keyIsContent(key: string): boolean {
  return key.split("_").some((word) => CONTENT_WORDS.includes(word));
}

/** Throws AuditValidationError when metadata could carry personal or clinical content. */
export function validateMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
  if (!metadata) return {};
  const keys = Object.keys(metadata);
  if (keys.length > MAX_META_KEYS) throw new AuditValidationError("too many metadata keys");
  for (const key of keys) {
    if (!META_KEY.test(key)) throw new AuditValidationError(`metadata key "${key}" is not allowed`);
    if (isSensitiveKey(key) || keyIsContent(key)) {
      throw new AuditValidationError(
        `metadata key "${key}" looks like personal or clinical content`,
      );
    }
    const value = metadata[key];
    const scalars = Array.isArray(value) ? value : [value];
    if (Array.isArray(value) && value.length > MAX_ARRAY) {
      throw new AuditValidationError(`metadata "${key}" has too many items`);
    }
    for (const item of scalars) {
      if (item === null || typeof item === "number" || typeof item === "boolean") continue;
      if (typeof item !== "string")
        throw new AuditValidationError(`metadata "${key}" must be a simple value`);
      if (item.length > MAX_STRING) throw new AuditValidationError(`metadata "${key}" is too long`);
      if (PHONE_LIKE.test(item) || EMAIL_LIKE.test(item)) {
        throw new AuditValidationError(`metadata "${key}" looks like a phone number or email`);
      }
    }
  }
  return { ...metadata };
}

function validateEntry(entry: AuditEntry): AuditEntry {
  if (!ACTION.test(entry.action))
    throw new AuditValidationError("action must look like entity.verb");
  if (!ENTITY.test(entry.entityType)) throw new AuditValidationError("entityType is not allowed");
  if (entry.entityId && !UUID.test(entry.entityId))
    throw new AuditValidationError("entityId must be a UUID");
  if (entry.actorUserId && !UUID.test(entry.actorUserId)) {
    throw new AuditValidationError("actorUserId must be a UUID");
  }
  return {
    ...entry,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ? entry.userAgent.slice(0, 200) : null,
    metadata: validateMetadata(entry.metadata),
  };
}

export class AuditService {
  constructor(
    private readonly store: AuditStore,
    private readonly logger: Logger = defaultLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const valid = validateEntry(entry);
    await this.store.append({ ...valid, occurredAt: this.now() });
  }

  async recordPhiAccess(entry: PhiAccessEntry): Promise<void> {
    if (!PHI_PURPOSES.includes(entry.purpose)) throw new AuditValidationError("unknown purpose");
    if (!PHI_RESOURCE_TYPES.includes(entry.resourceType))
      throw new AuditValidationError("unknown resource type");
    for (const id of [entry.actorUserId, entry.patientId, entry.resourceId]) {
      if (!UUID.test(id)) throw new AuditValidationError("ids must be UUIDs");
    }
    await this.store.appendPhi({ ...entry, occurredAt: this.now() });
  }

  /**
   * The hook withApi() calls after a successful audited request. If the entry cannot be
   * written the request fails: an action with no audit record must not look successful.
   */
  readonly writer: AuditWriter = async ({ spec, actorId, requestId, route, status }) => {
    try {
      await this.record({
        actorUserId: actorId,
        action: spec.action,
        entityType: spec.entity,
        metadata: { request_id: requestId, route, status },
      });
    } catch (cause) {
      this.logger.error({ event: "audit_write_failed", action: spec.action, err: cause });
      throw errors.internal({ cause });
    }
  };
}
