import { cellText, sourceRowNumber } from "./cells";
import { MAPPING_FIELDS, type ImportMapping, type MappingField } from "./model";
import type { ImportField, SourceSnapshot } from "./types";
import { fingerprint } from "./fingerprint";

const ALIASES: Record<MappingField, string[]> = {
  company: ["公司", "企业", "公司名称", "投递单位", "company"],
  position: ["岗位", "职位", "申请岗位", "投递岗位", "职位名称", "position", "jobtitle"],
  status: ["状态", "个人状态", "申请状态", "投递状态", "当前进展", "进度", "结果", "status"],
  appliedAt: ["投递日期", "投递时间", "申请日期", "网申日期", "提交日期", "appliedat"],
  url: ["网址", "链接", "投递链接", "网申入口", "申请链接", "职位详情", "官网", "url", "link"],
  notes: ["备注", "说明", "notes", "remark"],
  stages: ["网申", "测评", "笔试", "一面", "二面", "三面", "终面", "阶段"],
};
const clean = (text: string) => text.toLowerCase().replace(/[\s_（）()]/g, "");

export function mappedFields(snapshot: SourceSnapshot, mapping: Pick<ImportMapping, "headerStart" | "headerRows">): ImportField[] {
  if (snapshot.source.kind !== "sheets") return snapshot.fields;
  return snapshot.fields.map((field) => {
    const path = snapshot.rows.filter((row) => {
      const n = sourceRowNumber(row.key);
      return n >= mapping.headerStart && n < mapping.headerStart + mapping.headerRows;
    }).map((row) => cellText(row.cells[field.key])).filter(Boolean);
    return { ...field, name: path.join(" / ") || field.key };
  });
}

export function suggestMapping(snapshot: SourceSnapshot, header?: Pick<ImportMapping, "headerStart" | "headerRows" | "dataStart">): ImportMapping {
  const rows = snapshot.rows.slice(0, 20);
  const likely = rows.find((row) => Object.values(row.cells).filter((cell) =>
    Object.values(ALIASES).flat().some((name) => clean(name) === clean(cellText(cell)))).length >= 2);
  const headerStart = header?.headerStart ?? (likely ? sourceRowNumber(likely.key) : 1);
  const headerRows = header?.headerRows ?? 1;
  const fields = mappedFields(snapshot, { headerStart, headerRows });
  const columns = Object.fromEntries(MAPPING_FIELDS.map((key) => {
    const matches = fields.filter((field) => field.name.split(" / ").some((part) => ALIASES[key].includes(clean(part))));
    return [key, key === "stages" || matches.length === 1 ? matches.map((field) => field.key) : []];
  })) as ImportMapping["columns"];
  const personal = fields.some((field) => columns.status.includes(field.key) && /个人|申请|投递|进展/.test(field.name));
  return { columns, externalId: null, identityFields: [], defaultPosition: "", statusMeaning: personal ? "personal" : "unconfirmed", statusMap: {},
    headerStart, headerRows, headerFingerprint: null, dataStart: header?.dataStart ?? headerStart + headerRows, inheritCompany: "none",
    dateEncoding: "auto", dateRules: { year: null, order: null } };
}

export async function getHeaderFingerprint(snapshot: SourceSnapshot, mapping: ImportMapping): Promise<string | null> {
  return snapshot.source.kind === "sheets" ? fingerprint(mappedFields(snapshot, mapping).map(({ key, name }) => ({ key, name }))) : null;
}

export function validateMapping(snapshot: SourceSnapshot, mapping: ImportMapping): void {
  const keys = new Set(snapshot.fields.map((field) => field.key));
  if (Object.values(mapping.columns).flat().some((key) => !keys.has(key)) || (mapping.externalId && !keys.has(mapping.externalId))) {
    throw new Error("映射包含已删除字段，请重新选择");
  }
  if (!mapping.columns.company.length) throw new Error("请选择公司字段");
  if (mapping.dataStart <= mapping.headerStart + mapping.headerRows - 1 && snapshot.source.kind === "sheets") throw new Error("数据起始行必须在表头之后");
}
