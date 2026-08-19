/** Cmd+K 命令。 */
export interface Command {
  id: string;
  title: string;
  keywords?: string[];
  run: () => void | Promise<void>;
}

export class CommandRegistry {
  private items = new Map<string, Command>();

  register(cmd: Command): void {
    if (this.items.has(cmd.id)) {
      throw new Error(`[kernel] duplicate command: ${cmd.id}`);
    }
    this.items.set(cmd.id, cmd);
  }

  unregister(id: string): void {
    this.items.delete(id);
  }

  getAll(): Command[] {
    return [...this.items.values()];
  }

  /** 前缀/关键词匹配，供 Cmd+K 使用。 */
  search(query: string): Command[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAll();
    return this.getAll().filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  }
}

export const commands = new CommandRegistry();
