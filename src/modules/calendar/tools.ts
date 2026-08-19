import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import * as service from "./service";
import { categoryOf } from "../../lib/colors";
import { DAY_MS, toLocalIso, fromLocalIso, startOfToday } from "../../lib/time";

const localIso = z
  .string()
  .describe("本地时间 ISO 字符串，如 2025-06-08T15:00（无时区后缀，按用户本地时区解释）");

/** calendar 模块的 5 个 Agent 工具（描述写给 LLM 看）。 */
export const calendarTools: Record<string, Tool> = {
  calendar_listEvents: {
    name: "calendar_listEvents",
    description:
      "查询时间范围内的日程（含重复事件展开）。用于回答'今天/本周/下周有什么安排''最近忙不忙'。返回标题、起止时间、类别与事件 id。",
    parameters: z.object({
      start: localIso.optional().describe("范围开始；缺省今天 00:00"),
      end: localIso.optional().describe("范围结束；缺省 start 后 7 天"),
    }),
    execute: async (args) => {
      const start = args.start ? fromLocalIso(String(args.start)) : startOfToday();
      const end = args.end ? fromLocalIso(String(args.end)) : start + 7 * DAY_MS;
      const occs = await service.listOccurrences(start, end);
      if (occs.length === 0) return "该范围内没有日程。";
      return occs
        .map(
          (o) =>
            `- ${toLocalIso(o.startAt)}–${toLocalIso(o.endAt)} ${o.title}（${categoryOf(o.category).name}，id=${o.masterId}${o.isOccurrence ? `@${o.originalStart}` : ""}）`,
        )
        .join("\n");
    },
  },

  calendar_createEvent: {
    name: "calendar_createEvent",
    description: "创建日程。创建类操作可直接执行，无需用户确认。",
    parameters: z.object({
      title: z.string().describe("日程标题"),
      start: localIso,
      end: localIso,
      allDay: z.boolean().optional().describe("是否全天"),
      category: z
        .enum(["default", "work", "meeting", "focus", "personal", "health", "travel", "important"])
        .optional(),
      notes: z.string().optional(),
    }),
    execute: async (args) => {
      const start = fromLocalIso(String(args.start));
      const end = fromLocalIso(String(args.end));
      if (end <= start) return "错误：结束时间必须晚于开始时间。";
      const id = await service.createEvent({
        title: String(args.title),
        startAt: start,
        endAt: end,
        allDay: !!args.allDay,
        category: typeof args.category === "string" ? args.category : "default",
        notes: typeof args.notes === "string" ? args.notes : null,
      });
      return `已创建事件「${args.title}」（id=${id}）：${toLocalIso(start)} – ${toLocalIso(end)}。`;
    },
  },

  calendar_updateEvent: {
    name: "calendar_updateEvent",
    description:
      "修改日程（整个系列，或重复事件的单个实例）。必须先向用户复述将要执行的变更，等待用户明确确认后再调用。occurrenceStartIso 为该实例的原发生时间，缺省表示修改整个系列。",
    parameters: z.object({
      id: z.string().describe("事件 id（重复实例形如 masterId@原发生毫秒数）"),
      occurrenceStartIso: localIso.optional().describe("仅修改该次重复实例时传原发生时间"),
      title: z.string().optional(),
      start: localIso.optional(),
      end: localIso.optional(),
      allDay: z.boolean().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
    }),
    execute: async (args) => {
      const patch: service.EventPatch = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.start !== undefined) patch.startAt = fromLocalIso(String(args.start));
      if (args.end !== undefined) patch.endAt = fromLocalIso(String(args.end));
      if (args.allDay !== undefined) patch.allDay = !!args.allDay;
      if (args.category !== undefined) patch.category = String(args.category);
      if (args.notes !== undefined) patch.notes = String(args.notes);
      const target: service.EventTarget = {
        id: String(args.id),
        occurrenceStart: args.occurrenceStartIso
          ? fromLocalIso(String(args.occurrenceStartIso))
          : null,
      };
      await service.updateEvent(target, patch, true); // viaAgent：落 event_edits 学习信号
      return `已更新事件 ${args.id}${args.occurrenceStartIso ? "（该次实例）" : "（整个系列）"}。`;
    },
  },

  calendar_deleteEvent: {
    name: "calendar_deleteEvent",
    description:
      "删除日程（软删除；重复事件可只删单个实例）。必须先向用户复述将要删除的内容，等待用户明确确认后再调用。",
    parameters: z.object({
      id: z.string(),
      occurrenceStartIso: localIso.optional().describe("只删除该次重复实例时传原发生时间"),
    }),
    execute: async (args) => {
      const target: service.EventTarget = {
        id: String(args.id),
        occurrenceStart: args.occurrenceStartIso
          ? fromLocalIso(String(args.occurrenceStartIso))
          : null,
      };
      await service.deleteEvent(target);
      return `已删除 ${args.id}${args.occurrenceStartIso ? "（该次实例）" : "（整个系列）"}。`;
    },
  },

  calendar_findFreeSlots: {
    name: "calendar_findFreeSlots",
    description:
      "在时间范围内查找空闲时段（30 分钟步进，默认每天 8:00–22:00）。用于回答'我什么时候有空''帮我找 1 小时空闲'。",
    parameters: z.object({
      durationMinutes: z.number().int().min(15).max(480).describe("需要的时长（分钟）"),
      start: localIso.optional(),
      end: localIso.optional(),
      dayStartHour: z.number().int().min(0).max(23).optional(),
      dayEndHour: z.number().int().min(1).max(24).optional(),
    }),
    execute: async (args) => {
      const slots = await service.findFreeSlots({
        durationMinutes: Number(args.durationMinutes),
        start: args.start ? fromLocalIso(String(args.start)) : undefined,
        end: args.end ? fromLocalIso(String(args.end)) : undefined,
        dayStartHour: args.dayStartHour !== undefined ? Number(args.dayStartHour) : 8,
        dayEndHour: args.dayEndHour !== undefined ? Number(args.dayEndHour) : 22,
      });
      if (slots.length === 0) return "没有找到满足条件的空闲时段。";
      return slots.map((s) => `- ${toLocalIso(s.startAt)} – ${toLocalIso(s.endAt)}`).join("\n");
    },
  },
};
