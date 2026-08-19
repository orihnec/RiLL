// mock 意图解析链路无头验证（npx tsx scripts/check-intent.ts）
import { parseChineseMoment, parseDuration, parseIntent } from "../src/kernel/agent/mock";

let ok = true;
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    ok = false;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
};
const eq = (a: Date | null, y: number, mo: number, d: number, h: number, mi: number) =>
  !!a && a.getFullYear() === y && a.getMonth() === mo - 1 && a.getDate() === d && a.getHours() === h && a.getMinutes() === mi;

const BASE = new Date(2025, 5, 5, 10, 0, 0); // 2025-06-05 周四 10:00

// —— parseChineseMoment ——
expect(eq(parseChineseMoment("明天下午3点", BASE), 2025, 6, 6, 15, 0), "明天下午3点 → 6/6 15:00");
expect(eq(parseChineseMoment("后天上午10点半", BASE), 2025, 6, 7, 10, 30), "后天上午10点半 → 6/7 10:30");
expect(eq(parseChineseMoment("今晚8点", BASE), 2025, 6, 5, 20, 0), "今晚8点 → 6/5 20:00");
expect(eq(parseChineseMoment("周五下午2点", BASE), 2025, 6, 6, 14, 0), "周五下午2点 → 6/6 14:00（下一个周五）");
expect(eq(parseChineseMoment("周一下午2点", BASE), 2025, 6, 9, 14, 0), "周一下午2点 → 6/9 14:00（下周一）");
expect(eq(parseChineseMoment("6月8日 09:00", BASE), 2025, 6, 8, 9, 0), "6月8日 09:00 → 6/8 9:00");
expect(eq(parseChineseMoment("明天", BASE), 2025, 6, 6, 9, 0), "只有日期 → 默认 9:00");
expect(parseChineseMoment("随便聊聊", BASE) === null, "无时间短语 → null");

// —— parseDuration ——
expect(parseDuration("1小时") === 3_600_000, "1小时");
expect(parseDuration("90分钟") === 5_400_000, "90分钟");
expect(parseDuration("半小时") === 1_800_000, "半小时");
expect(parseDuration("一个半小时") === 5_400_000, "一个半小时");
expect(parseDuration("2个半小时") === 9_000_000, "2个半小时");
expect(parseDuration("30分钟") === 1_800_000, "30分钟");

// —— parseIntent（注入 BASE 保证确定性） ——
const create = parseIntent("明天下午3点和老王开会1小时", BASE);
expect(create.toolCalls.length === 1 && create.toolCalls[0].name === "calendar_createEvent", "创建意图 → calendar_createEvent");
expect(create.toolCalls[0].args.title === "老王开会", `标题提取：「${create.toolCalls[0].args.title}」`);
expect(create.toolCalls[0].args.start === "2025-06-06T15:00", `start：${create.toolCalls[0].args.start}`);
expect(create.toolCalls[0].args.end === "2025-06-06T16:00", `end：${create.toolCalls[0].args.end}`);

const list = parseIntent("帮我查一下这周有什么安排", BASE);
expect(list.toolCalls.length === 1 && list.toolCalls[0].name === "calendar_listEvents", "查询意图 → calendar_listEvents");

const free = parseIntent("帮我找1小时空闲", BASE);
expect(free.toolCalls.length === 1 && free.toolCalls[0].name === "calendar_findFreeSlots", "空闲意图 → calendar_findFreeSlots");
expect(free.toolCalls[0].args.durationMinutes === 60, "时长 60 分钟");

const fallback = parseIntent("今天天气怎么样");
expect(fallback.toolCalls.length === 0, "无法识别 → 不调用工具（提示配置 LLM）");

process.exit(ok ? 0 : 1);
