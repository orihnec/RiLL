/** 重复频率（UI 预设；完整 RFC 5545 RRULE 可经 rrule 字段直接写入）。 */
export type RecurFreq = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const RECUR_OPTIONS: { value: RecurFreq; label: string }[] = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

/** 预设频率 → RRULE 字符串（RFC 5545）。 */
export function rruleString(freq: RecurFreq): string | null {
  switch (freq) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
    default:
      return null;
  }
}

/** RRULE 字符串 → 预设频率（无法识别返回 none）。 */
export function freqOfRrule(rrule: string | null): RecurFreq {
  const m = rrule?.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
  if (!m) return "none";
  return m[1].toLowerCase() as RecurFreq;
}
