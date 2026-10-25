import { readDir, readTextFile, writeTextFile, stat } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getDb } from "../../kernel/db";
import {
  chunkMarkdown,
  embedTexts,
  fnv1a,
  upsertSourceChunks,
  deleteSourceChunks,
} from "../../kernel/rag/core";

/** kb_docs 行（文档树 / 状态角标用）。 */
export interface KbDocRow {
  path: string;
  title: string;
  hash: string | null;
  mtime: number | null;
  index_status: "pending" | "indexed" | "error";
  updated_at: number;
}

export function docTitle(content: string, path: string): string {
  const m = /^#{1,6}\s+(.+)$/m.exec(content.trim());
  if (m) return m[1].trim().slice(0, 60);
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export async function listKbDocs(): Promise<KbDocRow[]> {
  const db = getDb();
  return db.select<KbDocRow[]>("SELECT path, title, hash, mtime, index_status, updated_at FROM kb_docs ORDER BY path ASC");
}

/** 递归收集目录下全部 .md 文件。 */
async function collectMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await readDir(dir);
    } catch (e) {
      console.warn(`[kb] readDir failed: ${dir}`, e);
      return;
    }
    for (const entry of entries) {
      const p = await join(dir, entry.name);
      if (entry.isDirectory) {
        await walk(p);
      } else if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
        out.push(p);
      }
    }
  };
  await walk(root);
  return out.sort();
}

/** 索引单篇文件（kb_createDoc / kb_appendDoc 后立即调用）。 */
export async function indexFile(path: string): Promise<void> {
  const db = getDb();
  const content = await readTextFile(path);
  const chunks = chunkMarkdown(content, path);
  const embs = await embedTexts(chunks.map((c) => c.content));
  await upsertSourceChunks(path, chunks, embs);
  const st = await stat(path).catch(() => null);
  await db.execute(
    `INSERT INTO kb_docs (path, title, hash, mtime, index_status, updated_at)
     VALUES ($1, $2, $3, $4, 'indexed', $5)
     ON CONFLICT(path) DO UPDATE SET title=$2, hash=$3, mtime=$4, index_status='indexed', updated_at=$5`,
    [path, docTitle(content, path), fnv1a(content), st?.mtime ?? null, Date.now()],
  );
}

/**
 * 全量增量扫描：mtime+hash 对比，新增/变更索引，消失文件清理。
 * embedding 失败自动降级（纯 FTS5），状态仍记为 indexed。
 */
export async function scanKb(
  root: string,
  onProgress?: (msg: string) => void,
): Promise<{ indexed: number; removed: number; errors: number }> {
  const db = getDb();
  const files = await collectMarkdown(root);
  const existing = new Map((await listKbDocs()).map((d) => [d.path, d]));
  let indexed = 0;
  let removed = 0;
  let errors = 0;

  for (const f of files) {
    const prev = existing.get(f);
    if (prev && prev.hash !== null) {
      // hash 一致 = 内容未变，跳过（mtime 仅用于展示）
      const content0 = await readTextFile(f).catch(() => null);
      if (content0 !== null && fnv1a(content0) === prev.hash) {
        existing.delete(f);
        continue;
      }
    }
    onProgress?.(f);
    try {
      await indexFile(f);
      existing.delete(f);
      indexed++;
    } catch (e) {
      errors++;
      console.error(`[kb] index failed: ${f}`, e);
      await db.execute(
        `INSERT INTO kb_docs (path, title, hash, mtime, index_status, updated_at)
         VALUES ($1, $2, NULL, NULL, 'error', $3)
         ON CONFLICT(path) DO UPDATE SET index_status='error', updated_at=$3`,
        [f, f.split(/[\\/]/).filter(Boolean).pop() ?? f, Date.now()],
      );
    }
  }

  // 已消失的文件：清理索引与记录
  for (const gone of existing.values()) {
    await deleteSourceChunks(gone.path);
    await db.execute("DELETE FROM kb_docs WHERE path = $1", [gone.path]);
    removed++;
  }

  return { indexed, removed, errors };
}

/** 写新文件（相对知识库根目录，自动补 .md）。 */
export async function createKbFile(root: string, relPath: string, content: string): Promise<string> {
  const full = await join(root, relPath.endsWith(".md") ? relPath : `${relPath}.md`);
  await writeTextFile(full, content);
  return full;
}

/** 追加内容到文件（不存在则创建）。 */
export async function appendKbFile(root: string, relPath: string, content: string): Promise<string> {
  const full = await join(root, relPath.endsWith(".md") ? relPath : `${relPath}.md`);
  await writeTextFile(full, content, { append: true });
  return full;
}
