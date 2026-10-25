import { z } from "zod";
import type { Tool } from "../../kernel/agent/types";
import { createTodo, listTodos, toggleTodo, updateTodo, deleteTodo } from "./service";

function fmtTodos(
  todos: Awaited<ReturnType<typeof listTodos>>,
  title: string,
): string {
  if (todos.length === 0) return `${title}：（暂无）`;
  return (
    `${title}（${todos.length} 条）：\n` +
    todos
      .map((t, i) => {
        const when = t.dueAt
          ? `（计划 ${new Date(t.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）`
          : t.eventTitle
            ? `（绑定日程：${t.eventTitle}）`
            : "";
        return `${i + 1}. ${t.done ? "[已完成] " : ""}${t.title}${when}${t.notes ? ` · ${t.notes.slice(0, 60)}` : ""} | id: ${t.id}`;
      })
      .join("\n")
  );
}

const todo_create: Tool = {
  name: "todo_create",
  description:
    "新增一条待办（标题必填，可选计划时间 dueAt（unix 毫秒）、绑定日程 eventId、备注）。用户说'记一下/加个待办/提醒我 XX'时使用。创建类操作可直接执行。",
  parameters: z.object({
    title: z.string().describe("待办内容"),
    dueAt: z.number().optional().describe("计划时间（unix 毫秒），如今天 18:00"),
    eventId: z.string().optional().describe("绑定日程 id（先 calendar_listEvents 获取；不填则不绑定）"),
    notes: z.string().optional(),
  }),
  execute: async (args) => {
    const t = await createTodo({
      title: String(args.title ?? ""),
      dueAt: typeof args.dueAt === "number" ? args.dueAt : undefined,
      eventId: args.eventId !== undefined ? String(args.eventId) : undefined,
      notes: args.notes !== undefined ? String(args.notes) : undefined,
    });
    return `已创建待办：${t.title}${t.dueAt ? `（计划 ${new Date(t.dueAt).toLocaleString("zh-CN")}）` : ""}，id: ${t.id}`;
  },
};

const todo_list: Tool = {
  name: "todo_list",
  description: "列出待办（默认未完成，可按状态过滤）。用户问'有什么待办/我还有什么没做'时使用。",
  parameters: z.object({
    filter: z.enum(["open", "done", "all"]).optional().describe("默认 open（未完成）"),
  }),
  execute: async (args) => {
    const todos = await listTodos((args.filter as "open" | "done" | "all") ?? "open");
    return fmtTodos(todos, args.filter === "done" ? "已完成待办" : args.filter === "all" ? "全部待办" : "待办");
  },
};

const todo_toggle: Tool = {
  name: "todo_toggle",
  description:
    "切换待办的完成状态（完成/取消完成）。用户说'把 XX 标记完成/划掉'时使用。轻量状态切换，可直接执行。",
  parameters: z.object({
    id: z.string().describe("待办 id（todo_list 返回）"),
  }),
  execute: async (args) => {
    const t = await toggleTodo(String(args.id));
    return t ? `「${t.title}」已${t.done ? "标记完成" : "恢复未完成"}` : "未找到该待办";
  },
};

const todo_update: Tool = {
  name: "todo_update",
  description:
    "修改待办（标题/计划时间/绑定日程/备注）。修改类操作：先向用户复述将要执行的变更，确认后再调用。",
  parameters: z.object({
    id: z.string().describe("待办 id"),
    title: z.string().optional(),
    dueAt: z.number().nullable().optional().describe("计划时间（unix 毫秒），null 清除"),
    eventId: z.string().nullable().optional().describe("绑定日程 id，null 解除绑定"),
    notes: z.string().optional(),
  }),
  execute: async (args) => {
    await updateTodo(String(args.id), {
      title: args.title !== undefined ? String(args.title) : undefined,
      dueAt: args.dueAt !== undefined ? (args.dueAt as number | null) : undefined,
      eventId: args.eventId !== undefined ? (args.eventId as string | null) : undefined,
      notes: args.notes !== undefined ? String(args.notes) : undefined,
    });
    return `已更新待办 ${String(args.id)}`;
  },
};

const todo_delete: Tool = {
  name: "todo_delete",
  description: "删除待办。删除类操作：先向用户复述要删除哪条，确认后再调用。",
  parameters: z.object({
    id: z.string().describe("待办 id"),
  }),
  execute: async (args) => {
    await deleteTodo(String(args.id));
    return `已删除待办 ${String(args.id)}`;
  },
};

export const todoTools: Record<string, Tool> = {
  todo_create,
  todo_list,
  todo_toggle,
  todo_update,
  todo_delete,
};
