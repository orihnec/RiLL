/** RAG 数据源产出的一篇文档。 */
export interface Doc {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * RAG 数据源：RAG 核心统一处理 分块 → embedding → upsert → 混合检索。
 */
export interface RagSource {
  id: string; // 'kb' | 'calendar' | ...
  label: string; // 设置页展示名
  trigger: "watch" | "interval" | "manual";
  ingest: () => AsyncIterable<Doc>;
}

export class RagSourceRegistry {
  private sources = new Map<string, RagSource>();

  register(source: RagSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`[kernel] duplicate rag source: ${source.id}`);
    }
    this.sources.set(source.id, source);
  }

  getAll(): RagSource[] {
    return [...this.sources.values()];
  }
}

export const ragSources = new RagSourceRegistry();
