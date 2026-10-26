import { getDb } from "../../kernel/db";
// 求职中心的面经只读取投递的公开接口，保留独立数据与公司/岗位快照。
import { listJobs } from "../jobs/service";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createInterviewRepository } from "./repository";
import { exportMarkdown, exportFilename } from "./markdown";
import type { InterviewSession, InterviewQuestion, ApplicationChoice } from "./model";

export const interviewsRepository = () => createInterviewRepository(getDb());
export async function listApplicationChoices(): Promise<ApplicationChoice[]> {
  return (await listJobs()).map(({ id, company, position }) => ({ id, company, position }));
}
export async function saveInterviewMarkdown(session: InterviewSession, questions: InterviewQuestion[]): Promise<string | null> {
  const path = await save({ defaultPath: exportFilename(session), filters: [{ name: "Markdown 面经", extensions: ["md"] }] });
  if (!path) return null;
  await writeTextFile(path, exportMarkdown(session, questions));
  return path;
}
