import type { ComponentType } from "react";
import type { Tool } from "./agent/types";
import { toolRegistry } from "./agent/registry";
import type { Command } from "./commands";
import { commands } from "./commands";
import type { RagSource } from "./rag/sources";
import { ragSources } from "./rag/sources";
import type { Migration } from "./db";

/** 模块迁移：纯 SQL，或带 skipIf 的幂等迁移（ALTER 加列必须用后者）。 */
export type ModuleMigration = string | Pick<Migration, "sql" | "skipIf">;

/**
 * 模块可注册的 6 类能力（均可选）。
 * 新增功能 = 新增模块目录并在 modules.ts 加一行，内核零改动。
 */
export interface Module {
  id: string;
  name: string;
  /** 有序迁移 SQL（schema.sql / 后续迁移文件）；ALTER 类用 { sql, skipIf } 保证幂等重放 */
  migrations?: ModuleMigration[];
  /** Agent 工具：{工具名: 工具}，命名 {模块}_{动词} */
  tools?: Record<string, Tool>;
  /** RAG 数据源 */
  ragSources?: RagSource[];
  /** Cmd+K 命令 */
  commands?: Command[];
  /** UI 面板 */
  panels?: PanelDef[];
  /** 设置项 */
  settings?: SettingDef[];
}

export interface PanelDef {
  id: string;
  title: string;
  /** 挂载位置 */
  slot: "sidebar" | "main" | "right";
  component: ComponentType;
}

export interface SettingDef {
  id: string;
  title: string;
  component: ComponentType;
}

export interface ModuleRegistry {
  modules: Module[];
  /** 扁平化的迁移清单（模块顺序 = 应用顺序） */
  migrations: Migration[];
}

/** 加载模块清单：注册各模块能力，返回迁移清单。 */
export function loadModules(modules: Module[]): ModuleRegistry {
  const migrations: ModuleRegistry["migrations"] = [];
  for (const mod of modules) {
    for (const tool of Object.values(mod.tools ?? {})) {
      toolRegistry.register(tool);
    }
    for (const cmd of mod.commands ?? []) {
      commands.register(cmd);
    }
    for (const src of mod.ragSources ?? []) {
      ragSources.register(src);
    }
    (mod.migrations ?? []).forEach((m, i) => {
      // 迁移 id 由「模块 id + 数组下标」稳定寻址，插入新迁移只能追加、不能打乱顺序
      migrations.push(
        typeof m === "string"
          ? { id: `${mod.id}:${i}`, sql: m }
          : { id: `${mod.id}:${i}`, sql: m.sql, skipIf: m.skipIf },
      );
    });
    console.info(`[kernel] module loaded: ${mod.id} (${mod.name})`);
  }
  return { modules, migrations };
}
