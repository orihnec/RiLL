import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { basename, join } from "@tauri-apps/api/path";

/** `attach_extract` 的返回（Rust 侧 AttachText） */
interface AttachText {
  kind: string;
  text: string;
  chars: number;
  truncated: boolean;
}

/**
 * 把一个外部文件（PDF / Word / 文本）导入知识库目录，写成同名 `.md`。
 *
 * 抽文本交给 Rust（和聊天附件同一套逻辑），这里只负责落盘 + 命名。
 * 返回写入的完整路径；调用方随后触发一次增量索引即可。
 */
export async function importFileToKb(root: string, path: string): Promise<string> {
  const res = await invoke<AttachText>("attach_extract", { path });
  const fileName = await basename(path);
  const title = fileName.replace(/\.[^.]+$/, "");
  const target = await join(root, `${title}.md`);

  const header =
    `# ${title}\n\n` +
    `> 由 \`${fileName}\` 导入（${res.chars} 字${res.truncated ? "，已截断" : ""}）\n\n`;
  await writeTextFile(target, header + res.text);
  return target;
}
