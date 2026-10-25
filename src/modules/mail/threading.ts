/**
 * 邮件会话（线索）合并 —— JWZ 算法（Jamie Zawinski，Thunderbird/多数客户端同款）。
 *
 * 参考：<https://pkg.go.dev/github.com/floatpane/jwz-go> 对算法步骤的描述：
 * 1. 每条消息的 `References` 列表相邻两两连父子；
 * 2. 父节点优先取 `In-Reply-To`，否则取 `References` 最后一项；
 * 3. 剪掉没有真实消息的空占位节点（本实现只在需要分组，不需要建树显示，故省略）；
 * 4. **根节点按规范化主题合并**（剥掉 Re:/Fwd:/AW:/SV:/Odp:/Antw: 等各语言回复前缀 + 小写），
 *    用来兜住「转发」以及丢 References 的客户端；
 * 5. 会话按最新一封的时间倒序。
 *
 * 本文件是纯函数（无 DB / 无 IO），便于无头测试。
 */

/** 多语言回复/转发前缀：Re: Fwd: Fw: AW: SV: VS: RV: Antw: Odp: YNT: TR: Enc: */
const REPLY_PREFIX = /^\s*(?:re|fwd|fw|aw|sv|vs|rv|antw|odp|ynt|tr|enc|res|r)\s*(?:\[\d+\])?\s*:\s*/i;

/** 规范化主题：反复剥前缀、去掉列表标签 [xxx]、压空白、转小写。 */
export function canonicalSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(REPLY_PREFIX, "");
    if (next === s) break;
    s = next;
  }
  // 去掉开头的邮件列表标签（如 [Dev] / [上海求职]），最多 3 个
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/^\s*\[[^\]]{1,24}\]\s*/, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** message-id 归一：去尖括号与大小写（服务器间写法常有差异） */
export function normalizeMessageId(mid: string | null | undefined): string {
  return (mid ?? "").trim().replace(/^</, "").replace(/>$/, "").toLowerCase();
}

/** 地址归一：小写 + 去空白 */
export function normalizeAddress(addr: string | null | undefined): string {
  return (addr ?? "").trim().toLowerCase();
}

export interface ThreadMessage {
  /** 本地行 id（mail_messages.id） */
  id: string;
  messageId: string | null;
  references: string[];
  inReplyTo: string | null;
  subject: string | null;
  date: number;
  /** 该封涉及的全部地址（发件人 + 收件人），用于"参与者有交集才合并"判断 */
  participants: string[];
}

/** 同主题合并的时间窗：隔太久（比如去年和今年同名的招聘通知）不该并成一条 */
const SUBJECT_MERGE_WINDOW_MS = 30 * 86_400_000;

/** 公共邮箱域：同域不算"同一方"（否则两个 gmail 用户发的同名邮件会被并到一起） */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "qq.com",
  "foxmail.com",
  "163.com",
  "126.com",
  "yeah.net",
  "sina.com",
  "sina.cn",
  "sohu.com",
  "aliyun.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "139.com",
  "189.cn",
]);

class DisjointSet {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // 路径压缩
    let cur = key;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * 一封邮件里"有意义的对方标识"：
 * - 排除**我自己**的地址（否则所有发给我的同主题邮件都会被并到一起——这是实测踩到的坑）
 * - 对方是企业域时，额外把 `@域名` 也作为标识（同一家公司换个人发信也算同一会话）
 * - 公共邮箱域不加域名标识（两个 gmail 用户各发的"面试通知"不该并）
 */
function counterpartKeys(m: ThreadMessage, own: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const raw of m.participants) {
    const addr = normalizeAddress(raw);
    if (!addr || !addr.includes("@") || own.has(addr)) continue;
    keys.add(addr);
    const domain = addr.split("@")[1];
    if (domain && !FREEMAIL_DOMAINS.has(domain)) keys.add(`@${domain}`);
  }
  return keys;
}

function shareCounterpart(a: ThreadMessage, b: ThreadMessage, own: Set<string>): boolean {
  const ka = counterpartKeys(a, own);
  if (ka.size === 0) return false;
  const kb = counterpartKeys(b, own);
  for (const k of ka) if (kb.has(k)) return true;
  return false;
}

/**
 * 给每条消息算出一个稳定的 threadId。
 * `threadId` 取「该会话最早一封」的 message-id（跨次重算稳定）；没有 message-id 时退化为主题。
 *
 * @param ownAddresses 本邮箱自己的地址（用于把"我自己"从参与者交集里排除）
 */
export function assignThreads(
  messages: ThreadMessage[],
  ownAddresses: string[] = [],
): Map<string, string> {
  const own = new Set(ownAddresses.map(normalizeAddress).filter(Boolean));
  const dsu = new DisjointSet();
  for (const m of messages) {
    dsu.add(m.id);
    const mid = normalizeMessageId(m.messageId);
    if (mid) dsu.add(mid);
  }

  // 1) References 相邻连边 + 与 In-Reply-To 连父（父优先 In-Reply-To，其次 References 末项）
  for (const m of messages) {
    const chain = [...m.references.map(normalizeMessageId).filter(Boolean)];
    const self = normalizeMessageId(m.messageId);
    if (self) chain.push(self);
    for (let i = 1; i < chain.length; i++) dsu.union(chain[i - 1], chain[i]);
    const parent = normalizeMessageId(m.inReplyTo) || chain[chain.length - 2] || "";
    if (parent) dsu.union(parent, self || m.id);
    if (self) dsu.union(self, m.id);
  }

  // 2) 规范化主题 + 参与者交集 + 时间窗（兜住丢 References 的客户端与转发）
  const bySubject = new Map<string, ThreadMessage[]>();
  for (const m of messages) {
    const s = canonicalSubject(m.subject);
    if (!s) continue;
    const list = bySubject.get(s);
    if (list) list.push(m);
    else bySubject.set(s, [m]);
  }
  for (const group of bySubject.values()) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) {
      const a = group[0];
      const b = group[i];
      if (!shareCounterpart(a, b, own)) continue;
      if (Math.abs(a.date - b.date) > SUBJECT_MERGE_WINDOW_MS) continue;
      dsu.union(a.id, b.id);
    }
  }

  // 3) 每个分组取"最早一封"作为锚点，生成稳定 threadId
  const groups = new Map<string, ThreadMessage[]>();
  for (const m of messages) {
    const root = dsu.find(m.id);
    const list = groups.get(root);
    if (list) list.push(m);
    else groups.set(root, [m]);
  }

  const out = new Map<string, string>();
  for (const list of groups.values()) {
    const earliest = list.reduce((a, b) => (a.date <= b.date ? a : b));
    const mid = normalizeMessageId(earliest.messageId);
    const subj = canonicalSubject(earliest.subject);
    const threadId = mid ? `mid:${mid}` : subj ? `subj:${subj}` : `row:${earliest.id}`;
    for (const m of list) out.set(m.id, threadId);
  }
  return out;
}

/** 会话列表用的聚合摘要（由前端从消息算，避免多一张表） */
export interface ThreadSummary {
  threadId: string;
  subject: string;
  participants: { name: string; address: string }[];
  messageCount: number;
  unreadCount: number;
  hasAttachment: boolean;
  latestDate: number;
  earliestDate: number;
  latestUid: number;
  /** 最新一封的预览/摘要 */
  snippet: string;
  starred: boolean;
}
