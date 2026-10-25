import { Ban, FileEdit, Folder, Inbox, Send, Trash2 } from "lucide-react";

/** 文件夹图标（按服务器给的 special 属性，缺省是普通文件夹）。 */
export function folderIcon(special: string) {
  if (special === "inbox") return <Inbox className="size-3.5" />;
  if (special === "sent") return <Send className="size-3.5" />;
  if (special === "drafts") return <FileEdit className="size-3.5" />;
  if (special === "trash") return <Trash2 className="size-3.5" />;
  if (special === "junk") return <Ban className="size-3.5" />;
  return <Folder className="size-3.5" />;
}
