import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { fromLocalIso, toLocalIso } from "../../lib/time";
import {
  confirmExtraction,
  ignoreExtraction,
  listCandidates,
  pendingCount,
  scanFolder,
  estimateScan,
  KIND_LABEL,
  extractThread,
} from "./extract";
import { listAccounts, listFolders, listThreadMessages, listThreads } from "./service";

/**
 * mail 模块的 Agent 工具（描述写给 LLM 看）。
 *
 * 铁律（用户拍板）：**写日历必须先复述候选内容、得到用户确认**。
 * 所以 `mail_scan_schedule` 只做只读识别并返回候选，`mail_confirm_schedule` 才写入 ——
 * 而且它的描述里明确要求"先复述，用户同意后再调用"。
 */

const statusArg = z
  .enum(["pending", "confirmed", "ignored", "all"])
  .optional()
  .describe("筛选状态，默认 pending（待确认）");

/** 工具参数是 unknown，统一在这里收窄类型 */
const asString = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));
const asNumber = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** 找收件箱（找不到就用第一个可读文件夹） */
async function resolveInbox(accountEmail?: string): Promise<{ accountId: string; folderId: string; folderName: string }> {
  const accounts = await listAccounts();
  if (accounts.length === 0) throw new Error("还没有添加任何邮箱，请先在邮箱面板里添加");
  const account = accountEmail
    ? accounts.find((a) => a.email.toLowerCase() === accountEmail.toLowerCase() || (a.displayName ?? "") === accountEmail)
    : accounts[0];
  if (!account) throw new Error(`没找到邮箱 ${accountEmail}`);
  const folders = await listFolders(account.id);
  const inbox = folders.find((f) => f.special === "inbox" && f.selectable) ?? folders.find((f) => f.selectable);
  if (!inbox) throw new Error(`${account.email} 还没有可读文件夹，请先在邮箱面板同步一次`);
  return { accountId: account.id, folderId: inbox.id, folderName: inbox.name };
}

export const mailTools: Record<string, Tool> = {
  mail_schedule_scan: {
    name: "mail_schedule_scan",
    description:
      "扫描邮箱里最近的邮件，让 AI 找出**面试 / 笔试测评 / 宣讲会 / 投递截止 / offer 沟通**这些有时间点的安排，" +
      "并返回候选列表（**只读，不会写日历**）。用户问『帮我看看最近有什么面试』『邮箱里有没有要考试的』时用它。" +
      "返回的每条候选都带 id、时间、公司、原文依据；要落地到日历必须再用 mail_schedule_confirm 并先复述给用户。",
    parameters: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("最多分析多少封未识别过的邮件，默认 15"),
      email: z.string().optional().describe("指定邮箱地址；缺省用第一个账号"),
    }),
    execute: async (args) => {
      const { folderId, folderName } = await resolveInbox(asString(args.email));
      const limit = asNumber(args.limit, 15);
      const est = await estimateScan(folderId, limit);
      if (est.messages === 0) {
        return `「${folderName}」里没有待识别的新邮件（没有被 AI 分析过且有正文的邮件）。${
          est.skippedNoBody > 0 ? `另有 ${est.skippedNoBody} 封还没缓存正文，可让用户在邮箱面板点「补正文」。` : ""
        }`;
      }
      const res = await scanFolder(folderId, limit);
      const pending = await listCandidates("pending");
      if (res.candidates === 0) {
        return `扫描了 ${res.scanned} 封邮件，没有发现带明确时间的安排。`;
      }
      return [
        `已扫描 ${res.scanned} 封，识别出 ${res.candidates} 条候选（当前待确认共 ${pending.length} 条）：`,
        ...pending.slice(0, 12).map(
          (c) =>
            `- id=${c.id}｜${KIND_LABEL[c.kind]}｜${c.title}｜${c.startAt ? toLocalIso(c.startAt) : "时间待定"}` +
            `${c.location ? `｜${c.location}` : ""}${c.confidence < 0.6 ? "（置信度偏低）" : ""}` +
            `${c.evidence ? `｜依据：${c.evidence.slice(0, 60)}` : ""}`,
        ),
        "请把这些候选复述给用户，问清楚哪几条要写进日历，再用 mail_schedule_confirm 逐条确认。",
      ].join("\n");
    },
  },

  mail_schedule_list: {
    name: "mail_schedule_list",
    description:
      "列出邮箱 AI 识别出的日程候选（默认只看待确认的）。用户问『有什么待确认的面试安排』『刚才识别出来几条』时用它。",
    parameters: z.object({
      status: statusArg,
    }),
    execute: async (args) => {
      const raw = asString(args.status) ?? "pending";
      const status = (["pending", "confirmed", "ignored", "all"] as const).includes(
        raw as "pending" | "confirmed" | "ignored" | "all",
      )
        ? (raw as "pending" | "confirmed" | "ignored" | "all")
        : "pending";
      const list = await listCandidates(status, 50);
      if (list.length === 0) {
        return status === "pending" ? "目前没有待确认的日程候选。" : "没有符合条件的候选。";
      }
      return [
        `${status === "pending" ? "待确认" : status} 候选 ${list.length} 条：`,
        ...list.map(
          (c) =>
            `- id=${c.id}｜${KIND_LABEL[c.kind]}｜${c.title}｜${c.startAt ? toLocalIso(c.startAt) : "时间待定"}` +
            `｜${c.status}${c.eventId ? "（已写入日历）" : ""}｜来源：${c.sourceSubject.slice(0, 30)}`,
        ),
      ].join("\n");
    },
  },

  mail_schedule_confirm: {
    name: "mail_schedule_confirm",
    description:
      "把一条 AI 识别出的候选**写进日历**（会真的创建日程）。调用前**必须先复述**这条候选的时间、公司、岗位并得到用户明确同意。" +
      "用户想改时间/改标题时，用 title/start/end 覆盖。",
    parameters: z.object({
      id: z.string().describe("候选 id（来自 mail_schedule_scan / mail_schedule_list）"),
      title: z.string().optional().describe("覆盖标题"),
      start: z.string().optional().describe("覆盖开始时间，本地时间如 2026-10-12T14:00"),
      end: z.string().optional().describe("覆盖结束时间，可省略（默认 1 小时）"),
    }),
    execute: async (args) => {
      const startText = asString(args.start);
      const endText = asString(args.end);
      const startAt = startText ? fromLocalIso(startText) : undefined;
      if (startText && !Number.isFinite(startAt)) throw new Error(`时间格式不对：${startText}`);
      const eventId = await confirmExtraction(String(args.id), {
        title: asString(args.title),
        startAt,
        endAt: endText ? fromLocalIso(endText) : undefined,
      });
      return `已写入日历（事件 id=${eventId}）。可以在日历里看到，也可以用 calendar_updateEvent 再调整。`;
    },
  },

  mail_schedule_ignore: {
    name: "mail_schedule_ignore",
    description: "忽略一条日程候选（不再提醒、不写日历）。用户说『这条不用管』『不是面试』时用它。",
    parameters: z.object({ id: z.string().describe("候选 id") }),
    execute: async (args) => {
      await ignoreExtraction(String(args.id));
      return "已忽略这条候选。";
    },
  },

  mail_find_threads: {
    name: "mail_find_threads",
    description:
      "在邮箱里按关键词找会话（主题、发件人、正文都能命中，返回的是**会话**而不是单封邮件）。" +
      "用户问『字节那个面试邮件在哪』『找一下 XX 公司的邮件』时用它；拿到会话后可以再用 mail_schedule_scan 之类分析。",
    parameters: z.object({
      keyword: z.string().describe("关键词，如公司名、岗位、『面试邀请』"),
      email: z.string().optional().describe("指定邮箱地址；缺省用第一个账号"),
      onlyUnread: z.boolean().optional().describe("只看未读会话"),
      limit: z.number().int().min(1).max(30).optional().describe("最多返回多少条，默认 10"),
    }),
    execute: async (args) => {
      const { folderId, folderName } = await resolveInbox(asString(args.email));
      const res = await listThreads({
        folderId,
        keyword: String(args.keyword),
        unreadOnly: !!args.onlyUnread,
        limit: asNumber(args.limit, 10),
      });
      if (res.rows.length === 0) return `「${folderName}」里没有匹配「${args.keyword}」的会话。`;
      return [
        `「${folderName}」匹配到 ${res.total} 个会话（显示前 ${res.rows.length} 个）：`,
        ...res.rows.map(
          (t) =>
            `- ${t.subject}｜${t.messageCount} 封｜${t.participants.map((p) => p.name || p.address).slice(0, 2).join("、")}` +
            `｜${toLocalIso(t.latestDate)}${t.unreadCount > 0 ? `｜未读 ${t.unreadCount}` : ""}`,
        ),
      ].join("\n");
    },
  },

  mail_thread_read: {
    name: "mail_thread_read",
    description:
      "读一个会话的全部邮件正文（用 mail_find_threads 拿到的会话主题去匹配）。" +
      "用户让你『看看这封邮件说了什么』『这个面试什么时候』时，先找到会话再用它读全文，然后直接回答。",
    parameters: z.object({
      subject: z.string().describe("会话主题（会做模糊匹配）"),
      email: z.string().optional().describe("指定邮箱地址；缺省用第一个账号"),
    }),
    execute: async (args) => {
      const { folderId } = await resolveInbox(asString(args.email));
      const res = await listThreads({ folderId, keyword: String(args.subject), limit: 1 });
      const thread = res.rows[0];
      if (!thread) return `没找到主题包含「${args.subject}」的会话。`;
      const extracted = await extractThread(thread.threadId);
      const messages = await listThreadMessages(thread.threadId);
      const body = messages
        .map(
          (m) =>
            `【${toLocalIso(m.date)}｜${m.fromName || m.fromAddress}】\n${(m.bodyText ?? "").slice(0, 3000) || "(无纯文本正文)"}`,
        )
        .join("\n\n---\n\n");
      const extra =
        extracted.candidates > 0 ? `\n\n（顺带识别出 ${extracted.candidates} 条日程候选，可用 mail_schedule_list 查看）` : "";
      return `会话「${thread.subject}」（${messages.length} 封）：\n\n${body}${extra}`;
    },
  },
};

/** 给设置页/面板用的待确认数量（不在工具里，导出方便 UI 复用） */
export { pendingCount };
