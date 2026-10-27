import { apiId } from "../link";
import type { FeishuRequest } from "../types";

interface SheetMeta {
  sheetId: string;
  blockInfo?: { blockType?: string; blockToken?: string };
}

export async function resolveEmbeddedBase(request: FeishuRequest, documentToken: string, sheetId: string): Promise<{ appToken: string; tableId: string }> {
  const meta = await request<{ sheets?: SheetMeta[] }>(`/open-apis/sheets/v2/spreadsheets/${apiId(documentToken)}/metainfo`);
  const sheet = meta.sheets?.find((item) => item.sheetId === sheetId);
  const block = sheet?.blockInfo;
  if (block?.blockType !== "BITABLE_BLOCK") {
    throw new Error("父表元数据未提供可验证的内嵌多维表格关系；暂不能读取该工作表，请勿将父表 token 作为 Base token");
  }
  const match = /^([A-Za-z0-9]+)_(tbl[A-Za-z0-9]+)$/.exec(block.blockToken || "");
  if (!match) throw new Error("飞书返回的内嵌表资源标识不完整，暂不能读取");
  return { appToken: match[1], tableId: match[2] };
}
