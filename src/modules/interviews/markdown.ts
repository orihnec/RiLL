import { FORMATS, MASTERY, REVIEW_STATES, sessionTitle, type InterviewQuestion, type InterviewSession } from "./model";
const inline = (text: string) => text.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()#+!|<>]/g, "\\$&");
export function exportFilename(session: InterviewSession): string {
  const title = sessionTitle(session).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[ .]+$/, "").slice(0, 100) || "面经";
  return `面经-${session.interviewDate ?? "日期待补"}-${title}.md`;
}
export function exportMarkdown(session: InterviewSession, questions: InterviewQuestion[]): string {
  const lines = [`# ${inline(sessionTitle(session))}`, "", `- 公司：${inline(session.company) || "待补充"}`, `- 岗位：${inline(session.position) || "待补充"}`,
    `- 轮次：${inline(session.round) || "待补充"}`, `- 面试日期：${session.interviewDate ?? "未填写"}`, `- 形式：${FORMATS[session.format]}`, `- 复盘状态：${REVIEW_STATES[session.reviewStatus]}`,
    "", "## 原始速记", "", session.rawNotes || "（未填写）", "", "## 整体复盘", "", session.summary || "（未填写）", "", "## 面试问题", ""];
  const active = questions.filter(q => q.sessionId === session.id && q.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  active.forEach((q, i) => {
    lines.push(`### ${i + 1}. ${inline(q.prompt) || "待补充题目"}`, "", `- 掌握程度：${MASTERY[q.mastery]}`, `- 标签：${q.tags.length ? q.tags.map(inline).join("、") : "无"}`, "",
      "#### 题目原文", "", q.prompt || "（未填写）", "", "#### 追问", "", q.followUps || "（未填写）", "", "#### 当时的回答", "", q.answer || "（未填写）", "",
      "#### 复盘后的参考答案", "", q.referenceAnswer || "（未填写）", "", "#### 我的复盘", "", q.reflection || "（未填写）", "");
  });
  if (!active.length) lines.push("（尚未添加问题）", "");
  return lines.join("\n");
}
