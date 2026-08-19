import { toolRegistry } from "./registry";
import type { ToolCallView } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** mock 驱动的事件回调（由 chatStore 实现，负责更新 UI 状态）。 */
export interface MockEvents {
  onStart: (msgId: string, toolCalls: ToolCallView[]) => void;
  onDelta: (msgId: string, delta: string) => void;
  onTool: (msgId: string, tc: ToolCallView) => void;
  onDone: (msgId: string) => void;
}

interface MockPlan {
  intro: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
  outro: string;
}

/** 中文时间短语解析（mock 演示用，尽力而为）。 */
export function parseChineseMoment(text: string, base = new Date()): Date | null {
  const t = text.replace(/[，。、\s]/g, "");
  let dayOffset: number | null = null;

  if (/大后天/.test(t)) dayOffset = 3;
  else if (/后天/.test(t)) dayOffset = 2;
  else if (/明天|明日/.test(t)) dayOffset = 1;
  else if (/今天|今日|今晚|今早|今夜/.test(t)) dayOffset = 0;
  else if (/昨天/.test(t)) dayOffset = -1;
  else {
    const wd = /(?:周|星期)([一二三四五六日天])/.exec(t);
    if (wd) {
      const names = "一二三四五六日天";
      const target = names.indexOf(wd[1]) === 6 ? 0 : names.indexOf(wd[1]); // 日/天 → 周日(0)
      const cur = (base.getDay() + 6) % 7; // 周一 = 0
      dayOffset = ((target - cur + 7) % 7) || 7;
    } else {
      const md = /(\d{1,2})月(\d{1,2})日/.exec(t);
      if (md) {
        const d = new Date(base.getFullYear(), +md[1] - 1, +md[2]);
        if (d.getTime() < base.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1);
        const time = parseTimeOfDay(t);
        if (time) d.setHours(time.hour, time.minute, 0, 0);
        return d;
      }
      return null;
    }
  }

  const time = parseTimeOfDay(t);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  if (time) d.setHours(time.hour, time.minute, 0, 0);
  else d.setHours(9, 0, 0, 0); // 只有日期 → 默认 9:00
  return d;
}

/** 提取一天内的时间（上午/下午/晚上 或 HH:mm 或 数字点）。 */
function parseTimeOfDay(t: string): { hour: number; minute: number } | null {
  let hour: number;
  let minute = 0;
  const ampm = /(今晚|上午|早上|中午|下午|晚上|凌晨)/.exec(t);
  const hm =
    /(\d{1,2})[:：](\d{1,2})/.exec(t) ??
    /(\d{1,2})点(半|(\d{1,2})分)?/.exec(t);
  if (!hm) return null;
  hour = +hm[1];
  if (hm[2] === "半") minute = 30;
  else if (hm[3]) minute = +hm[3];
  if (ampm) {
    const p = ampm[1];
    if (p === "下午" || p === "晚上" || p === "今晚") hour = hour < 12 ? hour + 12 : hour;
    else if (p === "中午" && hour < 11) hour += 12;
    else if (p === "凌晨" && hour === 12) hour = 0;
  } else if (hour < 7) {
    hour += 12; // 裸数字保守按下午
  }
  return { hour, minute };
}

/** 中文时长解析：1小时 / 30分钟 / 半小时 / 一个半小时 / 2个半小时。 */
export function parseDuration(text: string): number | null {
  const t = text.replace(/\s/g, "");
  const h = /(\d+(?:\.\d+)?)个?小时/.exec(t);
  if (h) return Math.round(+h[1] * 3_600_000);
  const m = /(\d+(?:\.\d+)?)分钟/.exec(t);
  if (m) return Math.round(+m[1] * 60_000);
  const hh = /(\d+)个半小时/.exec(t);
  if (hh) return Math.round((+hh[1] + 0.5) * 3_600_000);
  if (/一个半小时/.test(t)) return 5_400_000;
  if (/半小时/.test(t)) return 1_800_000;
  return null;
}

function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractTitle(text: string): string {
  const quoted = /[「"“'](.+?)[」"”']/.exec(text);
  if (quoted) return quoted[1];
  let t = text;
  t = t.replace(
    /(大后天|后天|明天|今天|昨天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}日)[^，。]*?(上午|早上|中午|下午|晚上|凌晨)?\d{1,2}([:：]\d{1,2})?点(半|\d{1,2}分)?/g,
    "",
  );
  t = t.replace(/(\d+(?:\.\d+)?个?小时|一个半小时|半小时|\d+(?:\.\d+)?分钟)/g, "");
  t = t.replace(/(创建|新建|安排|添加|加上|约|请|帮我|我要|我想|一下|一个)/g, "");
  t = t.replace(/^[和跟与、，。\s]+/, "");
  t = t.replace(/[，。\s]+$/, "");
  return t || "未命名事件";
}

/** 意图解析（导出供无头测试；UI 链路经 runMockChat 使用）。 */
export function parseIntent(text: string, base = new Date()): MockPlan {
  const hasTimePhrase = parseChineseMoment(text, base) !== null;
  const explicitCreate = /创建|新建|添加|加一个|约|开会|会议|见面|碰/.test(text);
  const arrangedWithTime = /安排/.test(text) && hasTimePhrase;
  if ((explicitCreate || arrangedWithTime) && !/空闲/.test(text)) {
    const start = parseChineseMoment(text, base) ?? new Date(base.getTime() + 3_600_000);
    const dur = parseDuration(text) ?? 3_600_000;
    return {
      intro: "好的，我来帮你安排。",
      toolCalls: [
        {
          name: "calendar_createEvent",
          args: {
            title: extractTitle(text),
            start: toLocalIso(start),
            end: toLocalIso(new Date(start.getTime() + dur)),
          },
        },
      ],
      outro: "已创建。还有别的吗？",
    };
  }
  if (/空闲|有空/.test(text)) {
    const dur = parseDuration(text) ?? 3_600_000;
    return {
      intro: "帮你找找空闲时段。",
      toolCalls: [
        {
          name: "calendar_findFreeSlots",
          args: { durationMinutes: Math.round(dur / 60_000) },
        },
      ],
      outro: "以上是最近可用的时段。",
    };
  }
  if (/查|看看|有什么|安排|日程|忙/.test(text)) {
    return {
      intro: "好的，我查一下最近的日程。",
      toolCalls: [{ name: "calendar_listEvents", args: {} }],
      outro: "以上是近期日程。",
    };
  }
  return {
    intro: "",
    toolCalls: [],
    outro:
      "（演示模式）我只能识别：创建日程、查询日程、找空闲时段。在设置中配置 LLM 后即可获得完整能力。",
  };
}

/** 运行一次 mock 对话：流式模拟 + 真实执行注册表中的工具。 */
export async function runMockChat(
  text: string,
  events: MockEvents,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const plan = parseIntent(text);
  const msgId = crypto.randomUUID();
  const toolViews: ToolCallView[] = plan.toolCalls.map((tc, i) => ({
    id: `${msgId}-t${i}`,
    name: tc.name,
    args: tc.args,
    status: "running",
  }));

  events.onStart(msgId, toolViews);
  await streamText(plan.intro, (d) => events.onDelta(msgId, d), isCancelled);
  if (isCancelled()) return;

  for (let i = 0; i < plan.toolCalls.length; i++) {
    if (isCancelled()) return;
    const tc = plan.toolCalls[i];
    const tv = toolViews[i];
    const tool = toolRegistry.get(tc.name);
    try {
      const result = tool ? await tool.execute(tc.args) : `未知工具：${tc.name}`;
      events.onTool(msgId, { ...tv, status: "done", result });
    } catch (e) {
      events.onTool(msgId, { ...tv, status: "error", result: String(e) });
    }
  }

  await streamText(plan.outro, (d) => events.onDelta(msgId, d), isCancelled);
  events.onDone(msgId);
}

async function streamText(
  full: string,
  onDelta: (d: string) => void,
  isCancelled: () => boolean,
): Promise<void> {
  for (let i = 0; i < full.length; i += 2) {
    if (isCancelled()) return;
    onDelta(full.slice(i, i + 2));
    await sleep(20);
  }
}
