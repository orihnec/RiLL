import { RRule, type Options as RRuleOptions, type Weekday } from "rrule";
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

/** event_overrides 表行。 */
export interface OverrideRow {
  id: string;
  master_id: string;
  original_start_ms: number;
  title: string | null;
  notes: string | null;
  start_ms: number | null;
  end_ms: number | null;
  all_day: number | null;
  category: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * 展开后的一次日程（occurrence）。
 * 单次事件 = 主事件本身；重复事件 = 虚拟实例（由 RRULE 展开，无独立 id，
 * 以 masterId + originalStart 定位）。
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

/** 定位一个事件：单次/整个系列 = {id}；重复实例 = {id, occurrenceStart}。 */
export interface EventTarget {
  id: string;
  occurrenceStart?: number | null;
}

const MAX_OCCURRENCES_PER_EVENT = 500;

function overlaps(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start < rangeEnd && end > rangeStart;
}

/** 单次事件的 occurrence。 */
function toOccurrence(row: EventRow): Occurrence {
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

/** 重复事件在 originalStart 处的“默认 occurrence”（未例外时）。 */
function occurrenceAt(row: EventRow, originalStart: number): Occurrence {
  const dur = row.end_at - row.start_at;
  return {
    id: `${row.id}@${originalStart}`,
    masterId: row.id,
    title: row.title,
    notes: row.notes,
    startAt: originalStart,
    endAt: originalStart + dur,
    allDay: row.all_day === 1,
    category: row.category,
    rrule: row.rrule,
    originalStart,
    isOccurrence: true,
  };
}

/** 例外（override）对应的 occurrence；未覆盖字段继承主事件。 */
function overrideToOccurrence(row: EventRow, ov: OverrideRow): Occurrence {
  const baseDur = row.end_at - row.start_at;
  const startAt = ov.start_ms ?? ov.original_start_ms;
  const endAt = ov.end_ms ?? (ov.start_ms != null ? startAt + baseDur : ov.original_start_ms + baseDur);
  return {
    id: `${row.id}@${ov.original_start_ms}`,
    masterId: row.id,
    title: ov.title ?? row.title,
    notes: ov.notes ?? row.notes,
    startAt,
    endAt,
    allDay: ov.all_day != null ? ov.all_day === 1 : row.all_day === 1,
    category: ov.category ?? row.category,
    rrule: row.rrule,
    originalStart: ov.original_start_ms,
    isOccurrence: true,
  };
}

const WEEKDAY_MAP: Record<string, Weekday> = {
  SU: RRule.SU, MO: RRule.MO, TU: RRule.TU, WE: RRule.WE,
  TH: RRule.TH, FR: RRule.FR, SA: RRule.SA,
};
const FREQ_MAP: Record<string, number> = {
  YEARLY: RRule.YEARLY, MONTHLY: RRule.MONTHLY, WEEKLY: RRule.WEEKLY,
  DAILY: RRule.DAILY, HOURLY: RRule.HOURLY, MINUTELY: RRule.MINUTELY,
  SECONDLY: RRule.SECONDLY,
};

/** 解析 UNTIL：yyyyMMddTHHmmss[Z] → Date（带 Z 按 UTC，否则本地墙上时间）。 */
function parseUntil(v: string): Date {
  const iso = v.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
    "$1-$2-$3T$4:$5:$6$7",
  );
  return new Date(iso);
}

/** RRULE 字符串（RFC 5545 子集）→ rrule 构造选项（不含 dtstart）。 */
function rruleToOptions(rrule: string): Partial<RRuleOptions> {
  const opts: Record<string, unknown> = {};
  for (const part of rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    switch (k) {
      case "FREQ": opts.freq = FREQ_MAP[v] ?? RRule.WEEKLY; break;
      case "INTERVAL": opts.interval = Number(v); break;
      case "COUNT": opts.count = Number(v); break;
      case "UNTIL": opts.until = parseUntil(v); break;
      case "BYDAY": opts.byweekday = v.split(",").map((d) => WEEKDAY_MAP[d] ?? RRule.MO); break;
      case "BYMONTHDAY": opts.bymonthday = v.split(",").map(Number); break;
      case "BYMONTH": opts.bymonth = v.split(",").map(Number); break;
    }
  }
  return opts as Partial<RRuleOptions>;
}

/** RRULE 展开（含 EXDATE 排除 + override 替换）。 */
function expandRecurring(
  row: EventRow,
  rangeStart: number,
  rangeEnd: number,
  exdates: Set<number>,
  overrides: Map<number, OverrideRow>,
): Occurrence[] {
  let rule: RRule;
  try {
    // dtstart 用本地 Date 直接构造，避免 iCal 字符串解析的时区歧义
    rule = new RRule({ ...rruleToOptions(row.rrule!), dtstart: new Date(row.start_at) });
  } catch (e) {
    console.warn(`[calendar] bad rrule for ${row.id}:`, row.rrule, e);
    return [];
  }

  const out: Occurrence[] = [];
  const emitted = new Set<number>();
  let count = 0;
  for (const dt of rule.between(new Date(rangeStart), new Date(rangeEnd), true)) {
    if (++count > MAX_OCCURRENCES_PER_EVENT) break;
    const origStart = dt.getTime();
    if (exdates.has(origStart)) continue;
    const ov = overrides.get(origStart);
    emitted.add(origStart);
    if (ov) out.push(overrideToOccurrence(row, ov));
    else out.push(occurrenceAt(row, origStart));
  }
  // 例外可能把实例移入/移出区间：补扫未被 between 覆盖的 override
  for (const ov of overrides.values()) {
    if (emitted.has(ov.original_start_ms)) continue;
    const o = overrideToOccurrence(row, ov);
    if (overlaps(o.startAt, o.endAt, rangeStart, rangeEnd)) out.push(o);
  }
  return out;
}

/** 查询区间内的所有日程（含重复事件展开与例外）。 */
export async function listOccurrences(
  rangeStart: number,
  rangeEnd: number,
): Promise<Occurrence[]> {
  const db = getDb();
  // 重复事件主事件不按时间窗过滤（展开实例可能落在窗内）；单次事件按重叠过滤。
  const rows = await db.select<EventRow[]>(
    `SELECT id, title, notes, start_at, end_at, all_day, category, rrule, created_at, updated_at, deleted_at
     FROM events
     WHERE deleted_at IS NULL
       AND (rrule IS NOT NULL OR (start_at < $2 AND end_at > $1))
     ORDER BY start_at ASC`,
    [rangeStart, rangeEnd],
  );

  // 加载相关例外（exdate + override）
  const ids = rows.map((r) => r.id);
  const exdatesByMaster = new Map<string, Set<number>>();
  const overridesByMaster = new Map<string, Map<number, OverrideRow>>();
  if (ids.length > 0) {
    const ph = ids.map((_, i) => `$${i + 1}`).join(", ");
    const exdateRows = await db.select<{ event_id: string; exdate_ms: number }[]>(
      `SELECT event_id, exdate_ms FROM event_exdates WHERE event_id IN (${ph})`,
      ids,
    );
    for (const r of exdateRows) {
      let s = exdatesByMaster.get(r.event_id);
      if (!s) exdatesByMaster.set(r.event_id, (s = new Set()));
      s.add(r.exdate_ms);
    }
    const ovRows = await db.select<OverrideRow[]>(
      `SELECT id, master_id, original_start_ms, title, notes, start_ms, end_ms, all_day, category, created_at, updated_at
       FROM event_overrides WHERE master_id IN (${ph})`,
      ids,
    );
    for (const ov of ovRows) {
      let m = overridesByMaster.get(ov.master_id);
      if (!m) overridesByMaster.set(ov.master_id, (m = new Map()));
      m.set(ov.original_start_ms, ov);
    }
  }

  const out: Occurrence[] = [];
  for (const row of rows) {
    if (!row.rrule) {
      const o = toOccurrence(row);
      if (overlaps(o.startAt, o.endAt, rangeStart, rangeEnd)) out.push(o);
    } else {
      out.push(
        ...expandRecurring(
          row,
          rangeStart,
          rangeEnd,
          exdatesByMaster.get(row.id) ?? new Set(),
          overridesByMaster.get(row.id) ?? new Map(),
        ),
      );
    }
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

function toSqlValue(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

async function recordEdits(
  eventId: string,
  changes: { field: string; before: string | null; after: string | null }[],
  viaAgent: boolean,
): Promise<void> {
  if (changes.length === 0) return;
  const db = getDb();
  const now = Date.now();
  for (const c of changes) {
    await db.execute(
      `INSERT INTO event_edits (id, event_id, field, before_val, after_val, via_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), eventId, c.field, c.before, c.after, viaAgent ? 1 : 0, now],
    );
  }
}

/** 计算从 before（按列名索引）应用 patch 后的变化（用于 diff 记录）。 */
function diffPatch(
  before: Record<string, string | number | boolean | null>,
  patch: EventPatch,
): { field: string; before: string | null; after: string | null }[] {
  const out: { field: string; before: string | null; after: string | null }[] = [];
  const pairs: { col: string; val: unknown }[] = [
    { col: "title", val: patch.title },
    { col: "start_at", val: patch.startAt },
    { col: "end_at", val: patch.endAt },
    { col: "all_day", val: patch.allDay },
    { col: "category", val: patch.category },
    { col: "notes", val: patch.notes },
    { col: "rrule", val: patch.rrule },
  ];
  for (const p of pairs) {
    if (p.val === undefined) continue;
    const beforeVal = before[p.col];
    const after = stringify(toSqlValue(p.val));
    if (stringify(beforeVal) !== after) {
      out.push({ field: p.col, before: stringify(beforeVal), after });
    }
  }
  return out;
}

/**
 * 修改事件（整个系列：改 master；单个实例：写 override + exdate）。
 * 所有修改记录 diff 到 event_edits（隐式学习信号）。
 */
export async function updateEvent(
  target: EventTarget,
  patch: EventPatch,
  viaAgent = false,
): Promise<void> {
  const db = getDb();

  const rows = await db.select<EventRow[]>(
    "SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL",
    [target.id],
  );
  const row = rows[0];
  if (!row) throw new Error(`[calendar] event not found: ${target.id}`);

  // ---- 单实例例外修改 ----
  if (target.occurrenceStart != null) {
    if (!row.rrule) {
      throw new Error("[calendar] occurrence editing requires a recurring event");
    }
    const origStart = target.occurrenceStart;
    const ovs = await db.select<OverrideRow[]>(
      `SELECT id, master_id, original_start_ms, title, notes, start_ms, end_ms, all_day, category, created_at, updated_at
       FROM event_overrides WHERE master_id = $1 AND original_start_ms = $2`,
      [target.id, origStart],
    );
    const before = ovs.length
      ? overrideToOccurrence(row, ovs[0])
      : occurrenceAt(row, origStart);
    const changes = diffPatch(
      {
        title: before.title,
        start_at: before.startAt,
        end_at: before.endAt,
        all_day: before.allDay,
        category: before.category,
        notes: before.notes,
      },
      patch,
    );
    if (changes.length === 0) return;

    const now = Date.now();
    if (ovs.length) {
      const ov = ovs[0];
      const sets: string[] = [];
      const params: unknown[] = [];
      const cols: { col: string; val: unknown }[] = [
        { col: "title", val: patch.title },
        { col: "notes", val: patch.notes },
        { col: "start_ms", val: patch.startAt },
        { col: "end_ms", val: patch.endAt },
        { col: "all_day", val: patch.allDay },
        { col: "category", val: patch.category },
      ];
      for (const c of cols) {
        if (c.val === undefined) continue;
        sets.push(`${c.col} = $${params.length + 1}`);
        params.push(toSqlValue(c.val));
      }
      if (sets.length > 0) {
        sets.push(`updated_at = $${params.length + 1}`);
        params.push(now);
        params.push(ov.id);
        await db.execute(`UPDATE event_overrides SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      }
    } else {
      await db.execute(
        `INSERT INTO event_overrides
           (id, master_id, original_start_ms, title, notes, start_ms, end_ms, all_day, category, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          target.id,
          origStart,
          patch.title ?? null,
          patch.notes ?? null,
          patch.startAt ?? null,
          patch.endAt ?? null,
          patch.allDay !== undefined ? (patch.allDay ? 1 : 0) : null,
          patch.category ?? null,
          now,
          now,
        ],
      );
      // 例外替换原实例：原发生时间必须排除
      await db.execute(
        "INSERT OR IGNORE INTO event_exdates (event_id, exdate_ms) VALUES ($1, $2)",
        [target.id, origStart],
      );
    }
    await recordEdits(target.id, changes, viaAgent);
    return;
  }

  // ---- 整个系列（master）修改 ----
  const sets: string[] = [];
  const params: unknown[] = [];
  const changes: { field: string; before: string | null; after: string | null }[] = [];

  for (const { col, key } of FIELD_MAP) {
    if (patch[key] === undefined) continue;
    const before = row[col as keyof EventRow];
    const after = toSqlValue(patch[key]);
    if (String(before) !== String(after)) {
      sets.push(`${col} = $${params.length + 1}`);
      params.push(after);
      changes.push({ field: col, before: stringify(before), after: stringify(after) });
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
  await recordEdits(target.id, changes, viaAgent);
}

/**
 * 删除：整个系列 = 软删除 master；单个实例 = EXDATE（并清理其 override）。
 */
export async function deleteEvent(target: EventTarget): Promise<void> {
  const db = getDb();
  if (target.occurrenceStart != null) {
    await db.execute(
      "INSERT OR IGNORE INTO event_exdates (event_id, exdate_ms) VALUES ($1, $2)",
      [target.id, target.occurrenceStart],
    );
    await db.execute(
      "DELETE FROM event_overrides WHERE master_id = $1 AND original_start_ms = $2",
      [target.id, target.occurrenceStart],
    );
    return;
  }
  await db.execute(
    "UPDATE events SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL",
    [target.id, Date.now()],
  );
}
