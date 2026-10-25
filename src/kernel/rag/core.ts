import { getDb } from "../db";
import { getActiveProvider } from "../../stores/settingsStore";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * RAG 核心：分块 → embedding → upsert（memories + memories_fts）→ 混合检索。
 * embedding 失败自动降级纯 FTS5（供应商未配 embeddingModel 或请求失败）。
 */

/* ---------------- 分块 ---------------- */

export interface Chunk {
  content: string;
  metadata: Record<string, unknown>;
}

const CHUNK_CHARS = 700; // ≈500 tokens（中文约 1.4 字/token）
const OVERLAP_CHARS = 70; // ≈50 tokens

/** Markdown 标题层级分块：标题作为块上下文（metadata.title），超长硬切带 overlap。 */
export function chunkMarkdown(text: string, path: string): Chunk[] {
  const lines = text.split(/\r?\n/);
  const out: Chunk[] = [];
  const stack: { level: number; text: string }[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  const titleOf = () =>
    stack.map((h) => h.text).join(" › ") ||
    (path.split(/[\\/]/).filter(Boolean).pop() ?? path);

  const pushChunk = (content: string) => {
    const c = content.trim();
    if (!c) return;
    out.push({ content: c, metadata: { path, title: titleOf() } });
  };

  const flush = () => {
    if (buf.length === 0) return;
    pushChunk(buf.join("\n"));
    buf = [];
    bufLen = 0;
  };

  const pushLine = (line: string) => {
    // 单行超长：硬切，末尾 OVERLAP 字符带入下一段
    if (line.length > CHUNK_CHARS) {
      let rest = line;
      let first = true;
      while (rest.length > CHUNK_CHARS) {
        const part = rest.slice(0, CHUNK_CHARS);
        pushChunk((first ? buf.join("\n") + "\n" : "") + part);
        buf = [];
        bufLen = 0;
        first = false;
        rest = part.slice(-OVERLAP_CHARS) + rest.slice(CHUNK_CHARS);
      }
      buf.push(rest);
      bufLen = rest.length;
      return;
    }
    if (buf.length > 0 && bufLen + line.length + 1 > CHUNK_CHARS) {
      const tail = buf.join("\n").slice(-OVERLAP_CHARS);
      flush();
      if (tail) {
        buf.push(tail);
        bufLen = tail.length;
      }
    }
    buf.push(line);
    bufLen += line.length + 1;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: m[2].trim() });
      continue;
    }
    pushLine(line);
  }
  flush();
  return out;
}

/* ---------------- Embedding ---------------- */

function timeout(ms: number, msg: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

/**
 * 用当前供应商的 embeddingModel 批量向量化。
 * 未配置 embeddingModel / 请求失败 → null（调用方降级纯 FTS5）。
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const p = getActiveProvider();
  if (!p || !p.apiKeySet || !p.baseUrl.trim() || !p.embeddingModel.trim()) return null;
  const out: number[][] = [];
  const BATCH = 64;
  try {
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const res = await Promise.race([
        tauriFetch(`${p.baseUrl.trim().replace(/\/+$/, "")}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey}`,
          },
          body: JSON.stringify({ model: p.embeddingModel.trim(), input: batch }),
        }),
        timeout(15_000, "embedding 请求超时"),
      ]);
      if (!res.ok) {
        console.warn(`[rag] embeddings HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { data?: { embedding?: number[] }[] };
      const rows = json.data ?? [];
      if (rows.length !== batch.length || rows.some((r) => !r.embedding)) return null;
      for (const r of rows) out.push(r.embedding as number[]);
    }
    return out;
  } catch (e) {
    console.warn("[rag] embedding failed, fallback to FTS5-only:", e);
    return null;
  }
}

/* ---------------- 存储 ---------------- */

export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function floatsToBlob(v: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(v).buffer);
}

/** 覆盖写入某 source（文件路径）的全部块：先清旧，再插新（memories + fts 同步）。 */
export async function upsertSourceChunks(
  source: string,
  chunks: Chunk[],
  embeddings: number[][] | null,
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM memories WHERE source = $1", [source]);
  await db.execute("DELETE FROM memories_fts WHERE source = $1", [source]);
  const now = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO memories (id, source, content, metadata_json, embedding, hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        source,
        c.content,
        JSON.stringify(c.metadata),
        embeddings && embeddings[i] ? floatsToBlob(embeddings[i]) : null,
        fnv1a(c.content),
        now,
        now,
      ],
    );
    await db.execute("INSERT INTO memories_fts (content, source, doc_id) VALUES ($1, $2, $3)", [
      c.content,
      source,
      id,
    ]);
  }
}

export async function deleteSourceChunks(source: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM memories WHERE source = $1", [source]);
  await db.execute("DELETE FROM memories_fts WHERE source = $1", [source]);
}

/* ---------------- 混合检索 ---------------- */

export interface RagHit {
  docId: string;
  source: string;
  title: string;
  content: string;
  score: number;
}

function blobToFloats(b: Uint8Array | number[]): Float32Array {
  const buf = b instanceof Uint8Array ? b : Uint8Array.from(b as number[]);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function cosine(a: number[], b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * RRF 混合检索：FTS5 短语命中 + 向量余弦 top24 → 1/(60+rank) 合并 → topK。
 * 向量侧在无 embedding 时自动缺席（纯 FTS5）。
 */
export async function hybridSearch(query: string, topK = 8): Promise<RagHit[]> {
  const db = getDb();
  const scores = new Map<string, number>();
  const info = new Map<string, { source: string; title: string; content: string }>();

  // FTS5 短语匹配（unicode61 对中文按整句切 token，用短语查询）
  try {
    const q = `"${query.replace(/"/g, " ").trim()}"`;
    const rows = await db.select<
      { id: string; source: string; metadata_json: string; content: string }[]
    >(
      `SELECT m.id, m.source, m.metadata_json, m.content
       FROM memories_fts f JOIN memories m ON m.id = f.doc_id
       WHERE memories_fts MATCH $1
       LIMIT 24`,
      [q],
    );
    rows.forEach((r, i) => {
      const title = safeTitle(r.metadata_json ?? "");
      scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (60 + i + 1));
      if (!info.has(r.id)) info.set(r.id, { source: r.source, title, content: r.content });
    });
  } catch (e) {
    console.warn("[rag] fts search failed:", e);
  }

  // 向量余弦
  const qv = await embedTexts([query]);
  if (qv && qv[0]) {
    try {
      const rows = await db.select<
        { id: string; source: string; metadata_json: string; content: string; embedding: Uint8Array | number[] }[]
      >("SELECT id, source, metadata_json, content, embedding FROM memories WHERE embedding IS NOT NULL");
      const scored: { id: string; sim: number }[] = [];
      for (const r of rows) {
        const sim = cosine(qv[0], blobToFloats(r.embedding));
        if (sim > 0.12) scored.push({ id: r.id, sim });
      }
      scored.sort((a, b) => b.sim - a.sim);
      scored.slice(0, 24).forEach((s, i) => {
        scores.set(s.id, (scores.get(s.id) ?? 0) + 1 / (60 + i + 1));
        if (!info.has(s.id)) {
          const r = rows.find((x) => x.id === s.id);
          if (r) info.set(s.id, { source: r.source, title: safeTitle(r.metadata_json), content: r.content });
        }
      });
    } catch (e) {
      console.warn("[rag] vector search failed:", e);
    }
  }

  const hits = [...scores.entries()]
    .map(([docId, score]) => ({
      docId,
      score,
      ...(info.get(docId) ?? { source: docId, title: docId, content: "" }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return hits.map((h) => ({
    docId: h.docId,
    source: h.source,
    title: h.title,
    content: h.content,
    score: h.score,
  }));
}

function safeTitle(metadataJson: string): string {
  try {
    const m = JSON.parse(metadataJson) as { title?: string; path?: string };
    return m.title ?? m.path ?? "";
  } catch {
    return "";
  }
}
