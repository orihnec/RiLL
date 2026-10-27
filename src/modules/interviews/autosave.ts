import type { RecordMeta } from "./model";

export interface SaveStatus { dirty: boolean; saving: boolean; error: string | null }
interface Options<T> {
  save: (value: T) => Promise<T>;
  journal: (value: T | null) => void;
  changed: (value: T, status: SaveStatus) => void;
  delay?: number;
}
/** 每条记录串行保存。IO 期间继续打字只更新草稿，旧响应只推进 revision。 */
export class Autosave<T extends RecordMeta> {
  value: T;
  status: SaveStatus = { dirty: false, saving: false, error: null };
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  constructor(value: T, private options: Options<T>) { this.value = value; }
  private emit() { this.options.changed(this.value, { ...this.status }); }
  private persist() {
    try { this.options.journal(this.value); }
    catch { this.status.error = "本机草稿空间不足，请立即保存或导出当前内容"; }
  }
  patch(patch: Partial<T>) {
    const halted = Boolean(this.status.error);
    this.value = { ...this.value, ...patch };
    this.sequence++;
    this.status.dirty = true;
    // 错误（尤其是版本冲突）不因继续打字而被隐藏，也不自动重试覆盖。
    this.persist(); this.emit();
    if (!halted) this.schedule();
  }
  recover(value: T) { this.value = value; this.patch({}); }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.options.delay ?? 500);
  }
  accept(value: T) {
    if (this.status.dirty || this.running || value.revision < this.value.revision) return;
    this.value = value; this.emit();
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) { await this.running; if (this.status.dirty) return this.flush(); return; }
    if (!this.status.dirty) {
      if (this.status.error) { this.options.journal(null); this.status.error = null; this.emit(); }
      return;
    }
    const snapshot = structuredClone(this.value), sequence = this.sequence;
    this.status = { dirty: true, saving: true, error: null }; this.emit();
    this.running = (async () => {
      try {
        const saved = await this.options.save(snapshot);
        this.value = { ...this.value, revision: saved.revision, updatedAt: saved.updatedAt };
        this.status.dirty = this.sequence !== sequence;
        try { this.options.journal(this.status.dirty ? this.value : null); }
        catch { this.status.error = "数据库已保存，但本机草稿清理失败；可重试或导出"; }
      } catch (error) {
        this.status.error = error instanceof Error ? error.message : String(error);
        this.persist();
        throw error;
      } finally { this.status.saving = false; this.emit(); }
    })();
    try { await this.running; } finally { this.running = null; }
    if (this.status.dirty && !this.status.error) return this.flush();
  }
  discard(value: T) {
    if (this.running) throw new Error("正在保存，请稍后重试");
    clearTimeout(this.timer); this.options.journal(null);
    this.value = value; this.status = { dirty: false, saving: false, error: null }; this.emit();
  }
}
