import { getDb } from "../../kernel/db";

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  dueAt: number | null;
  eventId: string | null;
  /** 绑定日程的标题（JOIN events，仅展示） */
  eventTitle: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface NewTodoInput {
  title: string;
  dueAt?: number;
  eventId?: string;
  notes?: string;
}

export type TodoPatch = Partial<{
  title: string;
  dueAt: number | null;
  eventId: string | null;
  notes: string | null;
}>;

const COLS = `t.id, t.title, t.done, t.due_at, t.event_id, t.notes, t.created_at, t.updated_at, t.completed_at,
              ev.title AS event_title`;

function toTodo(r: {
  id: string;
  title: string;
  done: number;
  due_at: number | null;
  event_id: string | null;
  event_title: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}): Todo {
  return {
    id: r.id,
    title: r.title,
    done: r.done === 1,
    dueAt: r.due_at,
    eventId: r.event_id,
    eventTitle: r.event_title,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

/** 列表：open=未完成（due 排序）/ done=已完成 / all=全部。 */
export async function listTodos(filter: "open" | "done" | "all" = "open"): Promise<Todo[]> {
  const db = getDb();
  const where =
    filter === "open" ? "WHERE t.done = 0" : filter === "done" ? "WHERE t.done = 1" : "";
  const order =
    filter === "done" ? "ORDER BY t.completed_at DESC" : "ORDER BY COALESCE(t.due_at, 4102444800000) ASC, t.created_at ASC";
  const rows = await db.select<
    {
      id: string;
      title: string;
      done: number;
      due_at: number | null;
      event_id: string | null;
      event_title: string | null;
      notes: string | null;
      created_at: number;
      updated_at: number;
      completed_at: number | null;
    }[]
  >(
    `SELECT ${COLS} FROM todos t LEFT JOIN events ev ON ev.id = t.event_id ${where} ${order}`,
  );
  return rows.map(toTodo);
}

/** 今日相关待办：due_at 在今天 或 绑定日程发生在今天（悬浮窗用）。 */
export async function listTodayTodos(dayStart: number, dayEnd: number): Promise<Todo[]> {
  const db = getDb();
  const rows = await db.select<
    {
      id: string;
      title: string;
      done: number;
      due_at: number | null;
      event_id: string | null;
      event_title: string | null;
      notes: string | null;
      created_at: number;
      updated_at: number;
      completed_at: number | null;
    }[]
  >(
    `SELECT ${COLS} FROM todos t LEFT JOIN events ev ON ev.id = t.event_id
     WHERE t.done = 0 AND (
       (t.due_at >= $1 AND t.due_at < $2)
       OR (t.event_id IS NOT NULL AND ev.start_at >= $1 AND ev.start_at < $2)
     )
     ORDER BY COALESCE(t.due_at, ev.start_at, 4102444800000) ASC`,
    [dayStart, dayEnd],
  );
  return rows.map(toTodo);
}

export async function createTodo(input: NewTodoInput): Promise<Todo> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    `INSERT INTO todos (id, title, done, due_at, event_id, notes, created_at, updated_at)
     VALUES ($1, $2, 0, $3, $4, $5, $6, $6)`,
    [
      id,
      input.title.trim(),
      input.dueAt ?? null,
      input.eventId ?? null,
      input.notes?.trim() || null,
      now,
    ],
  );
  return {
    id,
    title: input.title.trim(),
    done: false,
    dueAt: input.dueAt ?? null,
    eventId: input.eventId ?? null,
    eventTitle: null,
    notes: input.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function updateTodo(id: string, patch: TodoPatch): Promise<void> {
  const db = getDb();
  const now = Date.now();
  if (patch.title !== undefined) {
    await db.execute("UPDATE todos SET title = $1, updated_at = $2 WHERE id = $3", [
      patch.title.trim(),
      now,
      id,
    ]);
  }
  if (patch.dueAt !== undefined) {
    await db.execute("UPDATE todos SET due_at = $1, updated_at = $2 WHERE id = $3", [
      patch.dueAt,
      now,
      id,
    ]);
  }
  if (patch.eventId !== undefined) {
    await db.execute("UPDATE todos SET event_id = $1, updated_at = $2 WHERE id = $3", [
      patch.eventId,
      now,
      id,
    ]);
  }
  if (patch.notes !== undefined) {
    await db.execute("UPDATE todos SET notes = $1, updated_at = $2 WHERE id = $3", [
      patch.notes === null ? null : patch.notes.trim() || null,
      now,
      id,
    ]);
  }
}

export async function toggleTodo(id: string): Promise<Todo | null> {
  const db = getDb();
  const rows = await db.select<{ done: number }[]>("SELECT done FROM todos WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const done = rows[0].done === 1 ? 0 : 1;
  const now = Date.now();
  await db.execute(
    "UPDATE todos SET done = $1, completed_at = $2, updated_at = $3 WHERE id = $4",
    [done, done === 1 ? now : null, now, id],
  );
  const list = await listTodos("all");
  return list.find((t) => t.id === id) ?? null;
}

export async function deleteTodo(id: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM todos WHERE id = $1", [id]);
}
