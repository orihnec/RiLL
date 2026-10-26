export interface FeishuConnection {
  id: string;
  appId: string;
  userId: string;
  userName: string;
  scope: string;
  connectedAt: number;
}

export interface FeishuLink {
  kind: "sheets" | "base";
  documentToken: string;
  sheetId: string | null;
  tableId: string | null;
  viewId: string | null;
  canonicalUrl: string;
}

export interface SourceDescriptor {
  connectionId: string;
  kind: "sheets" | "base" | "embedded-base";
  documentToken: string;
  resolvedResourceToken: string;
  containerId: string;
  viewId: string | null;
  canonicalUrl: string;
  title: string;
  containerTitle: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SourceChoice {
  id: string;
  title: string;
  hidden: boolean;
  type: string;
}

export interface SourceResolution {
  link: FeishuLink;
  selectedId: string | null;
  choices: SourceChoice[];
  source: SourceDescriptor | null;
}

export interface ImportField {
  key: string;
  name: string;
  type: string;
  raw: unknown;
}

export interface SourceRow {
  key: string;
  externalId: string | null;
  cells: Record<string, unknown>;
}

export interface SourceSnapshot {
  source: SourceDescriptor;
  fields: ImportField[];
  rows: SourceRow[];
  schemaFingerprint: string;
  startedAt: number;
  finishedAt: number;
  complete: true;
  warnings: string[];
  merges?: { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }[];
}

export interface ReadProgress {
  stage: string;
  records: number;
  requests: number;
}

export interface ReadOptions {
  signal: AbortSignal;
  onProgress?: (progress: ReadProgress) => void;
}

export type FeishuRequest = <T>(path: string, query?: Record<string, string>) => Promise<T>;
