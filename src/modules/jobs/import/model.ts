import type { DateRules } from "./dates";
import type { SourceDescriptor } from "./types";

export const PARSER_VERSION = "jobs-feishu-1";
export const MAPPING_FIELDS = ["company", "position", "status", "appliedAt", "url", "notes", "stages"] as const;
export type MappingField = typeof MAPPING_FIELDS[number];
export type RowKind = "application" | "preparing" | "listing" | "review" | "invalid";
export type ImportAction = "create" | "update" | "link" | "skip";
export type ValueField = "company" | "position" | "status" | "url" | "notes" | "appliedAt";
export const VALUE_FIELDS: ValueField[] = ["company", "position", "status", "url", "notes", "appliedAt"];
export interface ImportMapping {
  columns: Record<MappingField, string[]>;
  externalId: string | null;
  identityFields: string[];
  defaultPosition: string;
  statusMeaning: "personal" | "recruitment" | "unconfirmed";
  statusMap: Record<string, string>;
  headerStart: number;
  headerRows: number;
  headerFingerprint: string | null;
  dataStart: number;
  inheritCompany: "none" | "merged" | "confirmed";
  dateEncoding: "auto" | "text" | "sheets-serial";
  dateRules: DateRules;
  aiAssistance?: { model: string | null; acceptedAt: number; evidence: unknown };
}
export interface JobValues {
  company: string; position: string; status: string; url: string | null; notes: string | null;
  appliedAt: number | null; extras: Record<string, unknown> | null;
}
export interface JobSnapshot { id: string; values: JobValues; revision: number; updatedAt: number; createdAt: number; }
export interface ImportBinding {
  sourceId: string; identityKey: string; jobId: string; sourceFingerprint: string;
  lastSource: JobValues; lastWritten: JobValues; targetRevision: number; lastBatchId: string; revision: number;
}
export interface NormalizedRow {
  key: string; externalId: string | null; sourceFingerprint: string; kind: RowKind;
  values: JobValues; sourceStatus: string; evidence: { fieldKey: string; sourceText: string }[];
  warnings: string[]; raw: Record<string, unknown>;
}
export interface RowOverride {
  values?: Partial<Omit<JobValues, "extras">>;
  kind?: "application" | "preparing";
  identityConfirmed?: boolean;
  independent?: boolean;
  targetId?: string;
  action?: ImportAction;
  updateFields?: ValueField[];
  syncExtras?: boolean;
  selected?: boolean;
}
export interface PreviewRow {
  normalized: NormalizedRow;
  identityKey: string | null;
  action: ImportAction;
  selected: boolean;
  jobId: string;
  expected: JobSnapshot | null;
  binding: ImportBinding | null;
  values: JobValues;
  candidates: JobSnapshot[];
  differences: { field: ValueField; before: unknown; local: unknown; incoming: unknown; conflict: boolean; clears: boolean }[];
  reason: string;
  needsReview: boolean;
}
export interface FrozenRow {
  key: string; identityKey: string | null; sourceFingerprint: string; kind: RowKind;
  action: ImportAction; jobId: string; values: JobValues; sourceValues: JobValues;
  expected: JobSnapshot | null; binding: ImportBinding | null; normalized: NormalizedRow;
  disposition: string;
  selected: boolean;
}
export interface StagePayload {
  id: string; sourceId: string; source: SourceDescriptor; schemaFingerprint: string;
  statusSnapshot: string | null; statusFingerprint: string; parserVersion: string;
  mapping: ImportMapping; rows: FrozenRow[];
}
export interface ImportBatch { id: string; sourceId: string; hash: string; revision: number; state: string; createdAt: number; result: ImportResult | null; }
export interface ImportResult {
  createdApplications: number; createdPreparing: number; updated: number; linked: number;
  duplicates: number; unselectedListings: number; needsReview: number; invalid: number; unselected: number; failed: number;
  jobs: string[];
}
export interface UndoPreview { eligible: number; protected: number; rows: { key: string; jobId: string; action: string; eligible: boolean; reason: string }[]; }
