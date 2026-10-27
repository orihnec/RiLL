import type Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

export const hasJobColumn = async (db: Database, name: string): Promise<boolean> => {
  const columns = await db.select<{ name: string }[]>("PRAGMA table_info(job_applications)");
  return columns.some((column) => column.name === name);
};

export async function backupBeforeImportMigration(db: Database): Promise<boolean> {
  if (await hasJobColumn(db, "applied_at_known")) return true;
  await invoke("jobs_import_backup");
  return false;
}
