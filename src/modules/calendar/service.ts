import { getDb } from "../../kernel/db";

/** events 表行。 */
export interface EventRow {
  id: string;
  title: string;
  notes: string | null;
  start_at: number;
  end_at: number;
  all_day: number;
  category: string;
  rrule: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * 展开后的一次日程（occurrence）。
 * 单次事件 = 主事件本身；重复事件 = 虚拟实例（由 RRULE 展开，无独立 id）。
 */
export interface Occurrence {
  /** 单次事件：主事件 id；重复实例：`${masterId}@${originalStart}` */
  id: string;
  masterId: string;
  title: string;
  notes: string | null;
  startAt: number;
  endAt: number;
  allDay: boolean;
  category: string;
  rrule: string | null;
  /** 重复实例的原发生时间；单次事件为 null */
  originalStart: number | null;
  isOccurrence: boolean;
}

export interface NewEventInput {
  title: string;
  startAt: number;
  endAt: number;
  allDay?: boolean;
  category?: string;
  notes?: string | null;
  rrule?: string | null;
}

export interface EventPatch {
  title?: string;
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  category?: string;
  notes?: string | null;
  rrule?: string | null;
}

/** 定位一个事件：单次 = {id}；重复实例 = {id, occurrenceStart}。 */
export interface EventTarget {
  id: string;
  occurrenceStart?: number | null;
}

/** 列名 → patch 字段名 映射（唯一事实来源）。 */
const FIELD_MAP: { col: string; key: keyof EventPatch }[] = [
  { col: "title", key: "title" },
  { col: "start_at", key: "startAt" },
  { col: "end_at", key: "endAt" },
  { col: "all_day", key: "allDay" },
  { col: "category", key: "category" },
  { col: "notes", key: "notes" },
  { col: "rrule", key: "rrule" },
];

function rowToOccurrence(row: EventRow): Occurrence {
  return {
    id: row.id,
    masterId: row.id,
    title: row.title,
    notes: row.notes,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
    category: row.category,
    rrule: row.rrule,
    originalStart: null,
    isOccurrence: false,
  };
}

function overlaps(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start < rangeEnd && end > rangeStart;
}

/**
 * 展开单个主事件为区间内的 occurrences。
 * 单次事件直接返回；重复事件走 expandRecurring（C4 实现 RRULE + 例外）。
 */
function expandEvent(row: EventRow, rangeStart: number, rangeEnd: number): Occurrence[] {
  if (!row.rrule) {
    const o = rowToOccurrence(row);
    return overlaps(o.startAt, o.endAt, rangeStart, rangeEnd) ? [o] : [];
  }
  // TODO(C4): RRULE 展开 + exdate/override 例外处理
  return [];
}

/** 查询区间内的所有日程（含重复事件展开）。 */
export async function listOccurrences(
  rangeStart: number,
  rangeEnd: number,
): Promise<Occurrence[]> {
  const db = getDb();
  // 重复事件主事件不按时间窗过滤（其展开实例可能落在窗内）；
  // 单次事件按重叠过滤。
  const rows = await db.select<EventRow[]>(
    `SELECT id, title, notes, start_at, end_at, all_day, category, rrule, created_at, updated_at, deleted_at
     FROM events
     WHERE deleted_at IS NULL
       AND (rrule IS NOT NULL OR (start_at < $2 AND end_at > $1))
     ORDER BY start_at ASC`,
    [rangeStart, rangeEnd],
  );
  const out: Occurrence[] = [];
  for (const row of rows) {
    out.push(...expandEvent(row, rangeStart, rangeEnd));
  }
  out.sort((a, b) => a.startAt - b.startAt);
  return out;
}

/** 创建事件，返回事件 id。 */
export async function createEvent(input: NewEventInput): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.execute(
    `INSERT INTO events
       (id, title, notes, start_at, end_at, all_day, category, rrule, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.title,
      input.notes ?? null,
      input.startAt,
      input.endAt,
      input.allDay ? 1 : 0,
      input.category ?? "default",
      input.rrule ?? null,
      now,
      now,
    ],
  );
  return id;
}

/**
 * 修改事件（单次或整个系列）。记录 diff 到 event_edits（隐式学习信号）。
 * 重复事件的单实例修改（occurrenceStart）由 C4 实现 override 路径。
 */
export async function updateEvent(
  target: EventTarget,
  patch: EventPatch,
  viaAgent = false,
): Promise<void> {
  const db = getDb();
  if (target.occurrenceStart != null) {
    // TODO(C4): 重复事件单实例例外（override + exdate）
    throw new Error("[calendar] occurrence editing not implemented yet (C4)");
  }

  const rows = await db.select<EventRow[]>(
    "SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL",
    [target.id],
  );
  const row = rows[0];
  if (!row) throw new Error(`[calendar] event not found: ${target.id}`);

  const sets: string[] = [];
  const params: unknown[] = [];
  const edits: { field: string; before: string | null; after: string | null }[] = [];

  for (const { col, key } of FIELD_MAP) {
    if (patch[key] === undefined) continue;
    const before = row[col as keyof EventRow];
    const after = toSqlValue(patch[key]);
    if (String(before) !== String(after)) {
      sets.push(`${col} = $${params.length + 1}`);
      params.push(after);
      edits.push({ field: col, before: stringify(before), after: stringify(after) });
    }
  }
  if (sets.length === 0) return;

  sets.push(`updated_at = $${params.length + 1}`);
  params.push(Date.now());
  params.push(target.id);
  await db.execute(
    `UPDATE events SET ${sets.join(", ")} WHERE id = $${params.length}`,
    params,
  );

  const now = Date.now();
  for (const e of edits) {
    await db.execute(
      `INSERT INTO event_edits (id, event_id, field, before_val, after_val, via_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), target.id, e.field, e.before, e.after, viaAgent ? 1 : 0, now],
    );
  }
}

/** 软删除（单次或整个系列）。 */
export async function deleteEvent(target: EventTarget): Promise<void> {
  const db = getDb();
  if (target.occurrenceStart != null) {
    // TODO(C4): 重复事件删除单次（EXDATE）
    throw new Error("[calendar] occurrence editing not implemented yet (C4)");
  }
  await db.execute(
    "UPDATE events SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL",
    [target.id, Date.now()],
  );
}

function toSqlValue(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}
