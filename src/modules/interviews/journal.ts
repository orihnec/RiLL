import type { InterviewRecord, RecordKind } from "./model";

const PREFIX = "rill:interviews:draft:v1:";
export interface RecoveryDraft { key: string; kind: RecordKind; value: InterviewRecord; savedAt: number }
export interface DraftStorage { length: number; key(i: number): string | null; getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function createDraftJournal(storage: DraftStorage, owner: string) {
  const recordKey = (kind: RecordKind, id: string) => `${PREFIX}${owner}:${kind}:${id}`;
  return {
    key: recordKey,
    write(kind: RecordKind, id: string, value: InterviewRecord | null) {
      const key = recordKey(kind, id);
      if (!value) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify({ kind, value, savedAt: Date.now() }));
    },
    read(): RecoveryDraft[] {
      const drafts: RecoveryDraft[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const raw = JSON.parse(storage.getItem(key) || "");
          if ((raw.kind !== "session" && raw.kind !== "question") || !raw.value || typeof raw.value.id !== "string" || !Number.isInteger(raw.value.revision)) continue;
          const required = raw.kind === "session" ? ["title", "company", "position", "rawNotes", "summary", "round", "format", "reviewStatus"] : ["sessionId", "prompt", "followUps", "answer", "referenceAnswer", "reflection", "mastery"];
          if (!required.every(field => typeof raw.value[field] === "string")) continue;
          if (raw.kind === "question" && (!Array.isArray(raw.value.tags) || !raw.value.tags.every((tag: unknown) => typeof tag === "string"))) continue;
          drafts.push({ key, kind: raw.kind, value: raw.value, savedAt: Number(raw.savedAt) || 0 });
        } catch { /* 不是有效面经草稿的项不参与恢复，也不删除。 */ }
      }
      return drafts.sort((a, b) => b.savedAt - a.savedAt);
    },
    remove(key: string) { if (key.startsWith(PREFIX)) storage.removeItem(key); },
  };
}
