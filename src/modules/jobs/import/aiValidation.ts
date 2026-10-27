import { z } from "zod";
import { cellText } from "./cells";
import { MAPPING_FIELDS, type NormalizedRow } from "./model";
import type { ImportField } from "./types";

const evidence = z.object({ fieldKey: z.string(), sourceText: z.string().min(1).max(2000) }).strict();
export const assistSchema = z.object({
  columns: z.array(z.object({ target: z.enum(MAPPING_FIELDS), fieldKeys: z.array(z.string()).min(1), evidence: z.array(evidence).min(1) }).strict()).max(7),
  rows: z.array(z.object({ key: z.string(), kind: z.enum(["application", "preparing"]), statusId: z.string(), evidence: z.array(evidence).min(1) }).strict()).max(40),
}).strict();
export type AssistSuggestions = z.infer<typeof assistSchema>;

export function validateAssistance(value: unknown, fields: ImportField[], rows: NormalizedRow[], statuses: { id: string }[]): AssistSuggestions {
  const parsed = assistSchema.parse(value);
  const keys = new Set(fields.map((field) => field.key));
  const validEvidence = (items: z.infer<typeof evidence>[], row?: NormalizedRow) => items.every((item) => keys.has(item.fieldKey) &&
    (row ? cellText(row.raw[item.fieldKey]) : fields.find((field) => field.key === item.fieldKey)?.name || "").includes(item.sourceText));
  if (new Set(parsed.columns.map((column) => column.target)).size !== parsed.columns.length || new Set(parsed.rows.map((row) => row.key)).size !== parsed.rows.length) throw new Error("AI 返回重复建议，已拒绝");
  for (const column of parsed.columns) {
    if (column.fieldKeys.some((key) => !keys.has(key)) || !validEvidence(column.evidence)) throw new Error("AI 字段建议缺少真实表头依据，已拒绝");
  }
  for (const suggestion of parsed.rows) {
    const row = rows.find((row) => row.key === suggestion.key);
    if (!row || !validEvidence(suggestion.evidence, row) || !statuses.some((status) => status.id === suggestion.statusId) ||
      (suggestion.kind === "preparing") !== (suggestion.statusId === "preparing")) throw new Error("AI 行建议包含不存在的行、状态或原文依据，已拒绝");
  }
  return parsed;
}
