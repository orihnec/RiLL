import { apiId, parseFeishuLink } from "./link";
import { allPages } from "./pagination";
import { resolveEmbeddedBase } from "./readers/embedded";
import type { FeishuLink, FeishuRequest, SourceDescriptor, SourceResolution } from "./types";

export interface SheetProperties {
  sheet_id: string;
  title: string;
  hidden?: boolean;
  resource_type?: string;
  grid_properties?: { row_count?: number; column_count?: number };
  merges?: unknown[];
}

export async function querySheets(request: FeishuRequest, token: string): Promise<SheetProperties[]> {
  const data = await request<{ sheets?: SheetProperties[] }>(`/open-apis/sheets/v3/spreadsheets/${apiId(token)}/sheets/query`);
  if (!Array.isArray(data.sheets) || data.sheets.some((s) => !s.sheet_id || !s.title)) throw new Error("飞书未返回有效的工作表元数据");
  return data.sheets;
}

function descriptor(link: FeishuLink, connectionId: string, containerId: string, title: string): SourceDescriptor {
  return { connectionId, kind: link.kind, documentToken: link.documentToken,
    resolvedResourceToken: link.documentToken, containerId, viewId: link.viewId,
    canonicalUrl: link.canonicalUrl, title, containerTitle: title };
}

async function resolveSheet(request: FeishuRequest, link: FeishuLink, connectionId: string, selectedId?: string): Promise<SourceResolution> {
  const sheets = await querySheets(request, link.documentToken);
  const choices = sheets.map((s) => ({ id: s.sheet_id, title: s.title, hidden: Boolean(s.hidden), type: s.resource_type || "unknown" }));
  const id = selectedId || link.sheetId;
  const sheet = sheets.find((s) => s.sheet_id === id);
  if (!id) return { link, choices, selectedId: null, source: null };
  if (!sheet) throw new Error("链接指定的工作表不存在或当前用户无法读取");
  const source = descriptor(link, connectionId, sheet.sheet_id, sheet.title);
  const type = sheet.resource_type?.toLowerCase();
  if (link.tableId || type === "bitable" || type === "bitable_block") {
    const embedded = await resolveEmbeddedBase(request, link.documentToken, sheet.sheet_id);
    if (link.tableId && embedded.tableId !== link.tableId) throw new Error("链接的数据表与父表元数据不一致，请重新复制链接");
    source.kind = "embedded-base";
    source.resolvedResourceToken = embedded.appToken;
    source.containerId = embedded.tableId;
  } else if (type === "sheet" || type === "grid") {
    source.rowCount = sheet.grid_properties?.row_count;
    source.columnCount = sheet.grid_properties?.column_count;
    if (link.viewId) throw new Error("普通工作表暂不支持记录视图参数，请核对链接");
  } else { throw new Error(`暂不能确认工作表类型（${sheet.resource_type || "未提供"}），已停止读取`); }
  return { link, choices, selectedId: id, source };
}

async function resolveBase(request: FeishuRequest, link: FeishuLink, connectionId: string, selectedId?: string): Promise<SourceResolution> {
  const root = `/open-apis/bitable/v1/apps/${apiId(link.documentToken)}`;
  const meta = await request<{ app?: { name?: string } }>(root);
  const tables = await allPages<{ table_id: string; name: string }>(request, `${root}/tables`, {}, undefined, 1000);
  const choices = tables.map((t) => ({ id: t.table_id, title: t.name, hidden: false, type: "base" }));
  const id = selectedId || link.tableId;
  if (!id) return { link, choices, selectedId: null, source: null };
  const table = tables.find((t) => t.table_id === id);
  if (!table) throw new Error("链接指定的数据表不存在或无读取权限");
  const source = descriptor(link, connectionId, id, meta.app?.name || table.name);
  source.containerTitle = table.name;
  return { link, choices, selectedId: id, source };
}

export async function resolveFeishuSource(request: FeishuRequest, connectionId: string, input: string, selectedId?: string): Promise<SourceResolution> {
  const link = parseFeishuLink(input);
  if (selectedId && selectedId !== (link.kind === "sheets" ? link.sheetId : link.tableId)) {
    const url = new URL(link.canonicalUrl);
    url.searchParams.delete("table");
    url.searchParams.delete("view");
    url.searchParams.set(link.kind === "sheets" ? "sheet" : "table", selectedId);
    return resolveFeishuSource(request, connectionId, url.href);
  }
  return link.kind === "sheets" ? resolveSheet(request, link, connectionId, selectedId) : resolveBase(request, link, connectionId, selectedId);
}
