import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createFeishuClient } from "./feishuClient";
import { resolveFeishuSource } from "./source";
import { readBase } from "./readers/base";
import { readSheets } from "./readers/sheets";
import type { ReadOptions, SourceDescriptor, SourceResolution, SourceSnapshot } from "./types";

export async function inspectFeishuLink(connectionId: string, input: string, options: ReadOptions, selectedId?: string): Promise<SourceResolution> {
  const client = createFeishuClient(options);
  try {
    client.progress("正在确认文档类型", 0);
    return await resolveFeishuSource(client.request, connectionId, input, selectedId);
  } finally { client.close(); }
}

export async function readImportSource(source: SourceDescriptor, entireTable: boolean, options: ReadOptions): Promise<SourceSnapshot> {
  const client = createFeishuClient(options);
  const selected = { ...source, viewId: entireTable ? null : source.viewId };
  try {
    const onRows = (count: number) => client.progress("正在读取", count);
    client.progress("正在读取字段", 0);
    return selected.kind === "sheets" ? await readSheets(client.request, selected, onRows) : await readBase(client.request, selected, onRows);
  } finally { client.close(); }
}

export async function saveFeishuProbe(snapshot: SourceSnapshot): Promise<string | null> {
  const path = await save({ defaultPath: "FEISHU-P0-RESULT.json",
    filters: [{ name: "JSON 验证报告", extensions: ["json"] }] });
  if (!path) return null;
  const report = { phase: "P0", version: 1, source: snapshot.source,
    fields: snapshot.fields.map(({ key, name, type }) => ({ key, name, type })),
    recordsRead: snapshot.rows.length, complete: snapshot.complete, schemaFingerprint: snapshot.schemaFingerprint,
    startedAt: snapshot.startedAt, finishedAt: snapshot.finishedAt, warnings: snapshot.warnings,
    // 只保存供核对结构的少量样例；授权码、客户端密钥和访问令牌从不进入快照。
    sampleRows: snapshot.rows.slice(0, 5),
  };
  await writeTextFile(path, JSON.stringify(report, null, 2));
  return path;
}
