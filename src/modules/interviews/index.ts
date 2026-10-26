import { lazy } from "react";
import type { Module } from "../../kernel/module";
import schema from "./schema.sql?raw";

export const interviewsModule: Module = { id: "interviews", name: "面经复盘", migrations: [schema] };
export { openInterviews } from "./navigation";
export const InterviewsView = lazy(() => import("./views/InterviewsView").then(m => ({ default: m.InterviewsView })));
