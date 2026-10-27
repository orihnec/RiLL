import type { ImportMapping, RowKind } from "./model";

export interface Classification { kind: RowKind; status: string; warning?: string; }
export function classifyProgress(text: string, appliedAt: number | null, mapping: ImportMapping, statuses: { id: string; name: string }[]): Classification {
  const value = text.trim();
  const valid = (id: string) => statuses.some((status) => status.id === id);
  const mapped = mapping.statusMap[value];
  if (mapped && valid(mapped)) return { kind: mapped === "preparing" ? "preparing" : "application", status: mapped };
  const applied = (): Classification => ({ kind: "application", status: valid("applied") ? "applied" : "" });
  if (!value) return appliedAt !== null ? applied() : { kind: "listing", status: "preparing" };
  if (mapping.statusMeaning === "recruitment" || /^(开放|已开放|招聘中|已截止|截止|招满|内推开放)$/.test(value)) {
    return appliedAt !== null ? applied() : { kind: "listing", status: "preparing" };
  }
  if (mapping.statusMeaning !== "personal") return { kind: "review", status: "", warning: "请确认状态列是否表示个人投递进度，或明确映射该状态" };
  const exact = statuses.find((status) => status.name.toLowerCase() === value.toLowerCase() || status.id === value);
  if (exact) return { kind: exact.id === "preparing" ? "preparing" : "application", status: exact.id };
  const rules: [RegExp, string][] = [
    [/^(想投|准备投递|待投递|待投|未投|未投递)$/, "preparing"],
    [/^(已投|已投递|网申已提交|已提交|投递成功|网申成功)$/, "applied"],
    [/^(面试中|一面中|二面中|三面中|一面待安排|二面进行中|面试待安排)$/, "interviewing"],
    [/^(offer|已拿到offer|已收到offer|已录用)$/i, "offer"],
    [/^(被拒|已被拒|未通过|已淘汰|拒信)$/, "rejected"],
  ];
  const id = rules.find(([pattern]) => pattern.test(value))?.[1];
  if (id && valid(id)) return { kind: id === "preparing" ? "preparing" : "application", status: id };
  return { kind: "review", status: "", warning: `“${value}”需要选择对应状态；笔试、本人放弃和流程中不自动归为面试或被拒` };
}
