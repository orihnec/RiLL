import { fingerprint } from "../fingerprint";
import { apiId } from "../link";
import { querySheets } from "../source";
import type { FeishuRequest, ImportField, SourceDescriptor, SourceRow, SourceSnapshot } from "../types";

export function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

interface Values { valueRange?: { range?: string; values?: unknown[][] }; }

export async function readSheets(request: FeishuRequest, source: SourceDescriptor, onRows: (count: number) => void): Promise<SourceSnapshot> {
  const startedAt = Date.now();
  const sheets = await querySheets(request, source.documentToken);
  const sheet = sheets.find((s) => s.sheet_id === source.containerId);
  const rowCount = sheet?.grid_properties?.row_count;
  const columnCount = sheet?.grid_properties?.column_count;
  if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount) || rowCount! < 1 || columnCount! < 1) {
    throw new Error("工作表行列范围不可用，请重新获取元数据");
  }
  if (rowCount! > 10_000 || columnCount! > 256 || rowCount! * columnCount! > 500_000) {
    throw new Error("工作表超过 10,000 行、256 列或 500,000 单元格上限，请缩小来源表范围");
  }
  const structure = { title: sheet!.title, columns: columnCount, merges: sheet!.merges || [], type: sheet!.resource_type };
  const initial = await fingerprint(structure);
  const fields: ImportField[] = Array.from({ length: columnCount! }, (_, i) => ({ key: columnName(i), name: columnName(i), type: "cell", raw: { index: i } }));
  const rows: SourceRow[] = [];
  let bytes = 0;
  for (let start = 1; start <= rowCount!; start += 200) {
    const end = Math.min(rowCount!, start + 199);
    const range = `${source.containerId}!A${start}:${columnName(columnCount! - 1)}${end}`;
    const data = await request<Values>(`/open-apis/sheets/v2/spreadsheets/${apiId(source.documentToken)}/values/${encodeURIComponent(range)}`, {
      valueRenderOption: "ToString", dateTimeRenderOption: "FormattedString",
    });
    const values = data.valueRange?.values;
    if (!Array.isArray(values) || values.length > end - start + 1) throw new Error("工作表返回范围不完整或无效，已停止读取");
    bytes += new TextEncoder().encode(JSON.stringify(values)).byteLength;
    if (bytes > 32 * 1024 * 1024) throw new Error("工作表内容超过 32 MiB，请缩小范围后重试");
    values.forEach((cells, offset) => {
      if (!Array.isArray(cells) || cells.length > columnCount!) throw new Error("工作表列范围发生变化，请重新读取");
      if (cells.every((v) => v === null || v === "")) return;
      rows.push({ key: `${source.containerId}:${start + offset}`, externalId: null,
        cells: Object.fromEntries(cells.map((cell, i) => [columnName(i), cell])) });
    });
    onRows(rows.length);
  }
  const after = (await querySheets(request, source.documentToken)).find((s) => s.sheet_id === source.containerId);
  if (!after || await fingerprint({ title: after.title, columns: after.grid_properties?.column_count,
    merges: after.merges || [], type: after.resource_type }) !== initial || after.grid_properties?.row_count !== rowCount) {
    throw new Error("读取期间工作表结构或行数发生变化，请重新读取");
  }
  const merges = (sheet!.merges || []).map((raw) => {
    const area = raw as Record<string, number>;
    return { startRowIndex: area.start_row_index, endRowIndex: area.end_row_index,
      startColumnIndex: area.start_column_index, endColumnIndex: area.end_column_index };
  }).filter((area) => Object.values(area).every(Number.isInteger));
  return { source, fields, rows, merges, schemaFingerprint: initial, startedAt, finishedAt: Date.now(), complete: true,
    warnings: ["当前保留原始单元格及行定位；行号不作为持久去重标识。", "读取结果不保证跨请求强一致；需要在映射时确认表头、合并单元格和日期格式。"] };
}
